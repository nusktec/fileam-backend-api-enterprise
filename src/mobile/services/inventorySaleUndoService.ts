import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_SALE_STATUS,
} from "../../constants/inventory";
import {
  LEDGER_REFERENCE_TYPES,
} from "../../constants/ledger";
import {
  INVENTORY_SALE_UNDO_REASONS,
  RECORD_UNDO_ACTION,
  RECORD_UNDO_STATUS,
  mapUndoPayload,
  type SaleUndoReason,
} from "../../constants/recordUndo";
import { SALE_STATUS } from "../../constants/salePaymentRules";
import { HttpReplyError } from "../../utils/httpReplyError";
import {
  latestReversalEntryIdForReferences,
} from "../../services/recordUndoService";
import { reverseSaleLedgerOnDelete } from "../../services/ledgerSyncService";
import { calendarPeriodFromDate } from "../../utils/dateRangeQuery";
import { taxPayablesService } from "./taxPayablesService";

function d(v: Decimal | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

function dec(n: number): Decimal {
  return new Decimal(n);
}

function toSaleLedgerRow(sale: {
  id: string;
  paymentType: string;
  status: string;
  amount: Decimal;
  vatAmount: Decimal;
  totalAmount: Decimal;
  invoiceAmountPaid: unknown;
  saleDate: Date;
  settlementBankCode?: string | null;
}) {
  return {
    id: sale.id,
    paymentType: sale.paymentType,
    status: sale.status,
    amount: sale.amount,
    vatAmount: sale.vatAmount,
    totalAmount: sale.totalAmount,
    invoiceAmountPaid: sale.invoiceAmountPaid,
    saleDate: sale.saleDate,
    settlementBankCode: sale.settlementBankCode ?? null,
  };
}

async function recalculateLastSaleAt(
  tx: Prisma.TransactionClient,
  inventoryItemId: string,
): Promise<Date | null> {
  const last = await tx.inventoryMovement.findFirst({
    where: {
      inventoryItemId,
      type: INVENTORY_MOVEMENT_TYPES.SALE,
      sale: { status: INVENTORY_SALE_STATUS.LIVE },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last?.createdAt ?? null;
}

export type InventorySaleDetail = {
  id: string;
  soldAt: string;
  totalAmount: number;
  customerName: string | null;
  customerId: string | null;
  status: string;
  saleId: string | null;
  undo: ReturnType<typeof mapUndoPayload>;
  lines: Array<{
    inventoryItemId: string;
    itemName: string;
    category: string;
    quantity: number;
    unitSellingPrice: number;
    unitCost: number;
    lineTotal: number;
  }>;
};

function mapInventorySaleDetail(
  sale: {
    id: string;
    soldAt: Date;
    totalAmount: Decimal;
    customerName: string | null;
    customerId: string | null;
    status: string;
    linkedSaleId: string | null;
    undoAt: Date | null;
    undoReason: string | null;
    reversingEntryId: string | null;
    reversingEntryDate: Date | null;
    lines: Array<{
      inventoryItemId: string;
      quantity: Decimal;
      unitSellingPrice: Decimal;
      unitCost: Decimal;
      lineTotal: Decimal;
      inventoryItem: { name: string; category: string };
    }>;
  },
): InventorySaleDetail {
  return {
    id: sale.id,
    soldAt: sale.soldAt.toISOString(),
    totalAmount: d(sale.totalAmount),
    customerName: sale.customerName,
    customerId: sale.customerId,
    status: sale.status,
    saleId: sale.linkedSaleId,
    undo: mapUndoPayload(sale),
    lines: sale.lines.map((l) => ({
      inventoryItemId: l.inventoryItemId,
      itemName: l.inventoryItem.name,
      category: l.inventoryItem.category,
      quantity: d(l.quantity),
      unitSellingPrice: d(l.unitSellingPrice),
      unitCost: d(l.unitCost),
      lineTotal: d(l.lineTotal),
    })),
  };
}

async function loadInventorySale(userId: string, id: string) {
  const sale = await prisma.inventorySale.findFirst({
    where: { id, userId },
    include: {
      lines: {
        include: {
          inventoryItem: { select: { id: true, name: true, category: true } },
        },
      },
    },
  });
  if (!sale) {
    throw new HttpReplyError(404, "Inventory sale not found");
  }
  return sale;
}

function assertUndoReason(reason: string): SaleUndoReason {
  const trimmed = reason.trim();
  if (
    !(INVENTORY_SALE_UNDO_REASONS as readonly string[]).includes(trimmed)
  ) {
    throw new HttpReplyError(
      400,
      `reason must be one of: ${INVENTORY_SALE_UNDO_REASONS.join(", ")}`,
    );
  }
  return trimmed as SaleUndoReason;
}

function assertNotReversed(status: string): void {
  if (status === INVENTORY_SALE_STATUS.REVERSED) {
    throw new HttpReplyError(409, "This inventory sale has already been reversed.");
  }
}

export const inventorySaleUndoService = {
  mapInventorySaleDetail,

  async getUndoCheck(userId: string, inventorySaleId: string) {
    const sale = await loadInventorySale(userId, inventorySaleId);
    assertNotReversed(sale.status);
    return { action: RECORD_UNDO_ACTION.REVERSE };
  },

  async undo(userId: string, inventorySaleId: string, reason: string) {
    const undoReason = assertUndoReason(reason);
    const existing = await loadInventorySale(userId, inventorySaleId);
    assertNotReversed(existing.status);

    const undoAt = new Date();
    const periodsToSync: Array<{ year: number; month: number }> = [];

    const updated = await prisma.$transaction(async (tx) => {
      const invSale = await tx.inventorySale.findFirst({
        where: { id: inventorySaleId, userId },
        include: {
          lines: {
            include: {
              inventoryItem: {
                select: { id: true, name: true, category: true },
              },
            },
          },
        },
      });
      if (!invSale) throw new HttpReplyError(404, "Inventory sale not found");
      assertNotReversed(invSale.status);

      for (const line of invSale.lines) {
        const qty = d(line.quantity);
        const item = await tx.inventoryItem.findFirst({
          where: { id: line.inventoryItemId, userId },
        });
        if (!item) continue;
        const newQty = d(item.quantity) + qty;
        const lastSaleAt = await recalculateLastSaleAt(tx, item.id);
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            quantity: dec(newQty),
            lastSaleAt,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            userId,
            inventoryItemId: item.id,
            type: INVENTORY_MOVEMENT_TYPES.ADJUSTMENT_IN,
            quantityDelta: dec(qty),
            quantityAfter: dec(newQty),
            inventorySaleId: invSale.id,
            note: "Inventory sale reversal",
          },
        });
      }

      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;

      if (invSale.linkedSaleId) {
        const linkedSale = await tx.sale.findFirst({
          where: { id: invSale.linkedSaleId, userId },
        });
        if (linkedSale) {
          if (
            linkedSale.status === SALE_STATUS.REVERSED ||
            linkedSale.status === SALE_STATUS.VOIDED
          ) {
            throw new HttpReplyError(
              409,
              "The linked sale has already been undone.",
            );
          }
          periodsToSync.push(calendarPeriodFromDate(linkedSale.saleDate));
          await reverseSaleLedgerOnDelete(
            userId,
            toSaleLedgerRow(linkedSale),
            tx,
          );
          reversingEntryId = await latestReversalEntryIdForReferences(
            userId,
            [
              {
                referenceType: LEDGER_REFERENCE_TYPES.SALE_RECOGNITION,
                referenceId: linkedSale.id,
              },
              {
                referenceType: LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
                referenceId: `${linkedSale.id}:confirm`,
              },
            ],
            tx,
          );
          reversingEntryDate = undoAt;
          await tx.sale.update({
            where: { id: linkedSale.id },
            data: {
              status: SALE_STATUS.REVERSED,
              undoAt,
              undoReason,
              reversingEntryId,
              reversingEntryDate,
            },
          });
        }
      }

      const row = await tx.inventorySale.update({
        where: { id: invSale.id },
        data: {
          status: INVENTORY_SALE_STATUS.REVERSED,
          undoAt,
          undoReason,
          reversingEntryId,
          reversingEntryDate,
        },
        include: {
          lines: {
            include: {
              inventoryItem: {
                select: { id: true, name: true, category: true },
              },
            },
          },
        },
      });
      return row;
    });

    if (periodsToSync.length > 0) {
      await taxPayablesService.syncPayablesForPeriods(userId, periodsToSync);
    }

    const detail = mapInventorySaleDetail(updated);
    return {
      action: RECORD_UNDO_ACTION.REVERSE,
      status: RECORD_UNDO_STATUS.REVERSED,
      data: detail,
    };
  },
};
