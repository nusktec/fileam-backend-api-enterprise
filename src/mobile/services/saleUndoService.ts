import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { INVENTORY_MOVEMENT_TYPES } from "../../constants/inventory";
import {
  LEDGER_REFERENCE_TYPES,
} from "../../constants/ledger";
import {
  mapUndoPayload,
  RECORD_UNDO_ACTION,
  RECORD_UNDO_STATUS,
  type RecordUndoAction,
  type SaleUndoReason,
  undoStatusFromAction,
} from "../../constants/recordUndo";
import { SALE_STATUS } from "../../constants/salePaymentRules";
import {
  assertNotAlreadyUndone,
  findPrimaryReversingEntry,
  recordHasLedgerImpact,
  resolveUndoAction,
} from "../../services/recordUndoService";
import {
  reverseSaleLedgerOnDelete,
} from "../../services/ledgerSyncService";
import { calendarPeriodFromDate } from "../../utils/dateRangeQuery";
import { HttpReplyError } from "../../utils/httpReplyError";
import { taxPayablesService } from "./taxPayablesService";
import { salesService } from "./salesService";

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

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

async function reverseLinkedInventorySaleInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  saleId: string,
  inventorySaleId: string | null | undefined,
  undoAt: Date,
  undoReason: string,
  reversingEntryId: string | null,
  reversingEntryDate: Date | null,
): Promise<void> {
  const invSale = inventorySaleId
    ? await tx.inventorySale.findFirst({
        where: { id: inventorySaleId, userId },
        include: { lines: true },
      })
    : await tx.inventorySale.findFirst({
        where: { linkedSaleId: saleId, userId },
        include: { lines: true },
      });

  if (!invSale || invSale.status === RECORD_UNDO_STATUS.REVERSED) return;

  for (const line of invSale.lines) {
    const item = await tx.inventoryItem.findUniqueOrThrow({
      where: { id: line.inventoryItemId },
    });
    const qty = decimalToNumber(line.quantity);
    const newQty = decimalToNumber(item.quantity) + qty;
    await tx.inventoryItem.update({
      where: { id: line.inventoryItemId },
      data: { quantity: new Decimal(newQty) },
    });
    await tx.inventoryMovement.create({
      data: {
        userId,
        inventoryItemId: line.inventoryItemId,
        type: INVENTORY_MOVEMENT_TYPES.ADJUSTMENT_IN,
        quantityDelta: new Decimal(qty),
        quantityAfter: new Decimal(newQty),
        inventorySaleId: invSale.id,
        note: "Inventory sale reversed",
      },
    });
  }

  await tx.inventorySale.update({
    where: { id: invSale.id },
    data: {
      status: RECORD_UNDO_STATUS.REVERSED,
      undoAt,
      undoReason,
      reversingEntryId,
      reversingEntryDate,
    },
  });
}

async function resolveSaleUndoAction(
  userId: string,
  sale: { id: string; status: string; inventorySaleId: string | null },
): Promise<RecordUndoAction> {
  const hasLedger = await recordHasLedgerImpact(userId, sale.id);
  const action = resolveUndoAction(hasLedger);

  if (
    action === RECORD_UNDO_ACTION.VOID &&
    (hasLedger || sale.inventorySaleId)
  ) {
    throw new HttpReplyError(
      409,
      "This sale cannot be voided because it has accounting or inventory impact",
    );
  }

  return action;
}

export const saleUndoService = {
  async getUndoCheck(userId: string, saleId: string) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
    });
    if (!sale) return null;

    assertNotAlreadyUndone(sale.status, "sale");
    const action = await resolveSaleUndoAction(userId, sale);
    return { action };
  },

  async undo(userId: string, saleId: string, reason: SaleUndoReason) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
    });
    if (!sale) return null;

    assertNotAlreadyUndone(sale.status, "sale");
    const action = await resolveSaleUndoAction(userId, sale);
    const undoStatus = undoStatusFromAction(action);
    const undoAt = new Date();
    const period = calendarPeriodFromDate(sale.saleDate);

    const updated = await prisma.$transaction(async (tx) => {
      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;

      if (action === RECORD_UNDO_ACTION.REVERSE) {
        await reverseSaleLedgerOnDelete(userId, toSaleLedgerRow(sale), tx);
        const entry = await findPrimaryReversingEntry(
          userId,
          LEDGER_REFERENCE_TYPES.SALE_RECOGNITION,
          sale.id,
          tx,
        );
        reversingEntryId = entry?.id ?? null;
        reversingEntryDate = entry?.transactionDate ?? undoAt;

        await reverseLinkedInventorySaleInTx(
          tx,
          userId,
          sale.id,
          sale.inventorySaleId,
          undoAt,
          reason,
          reversingEntryId,
          reversingEntryDate,
        );
      }

      return tx.sale.update({
        where: { id: saleId },
        data: {
          status:
            undoStatus === RECORD_UNDO_STATUS.VOIDED
              ? SALE_STATUS.VOIDED
              : SALE_STATUS.REVERSED,
          undoAt,
          undoReason: reason,
          reversingEntryId,
          reversingEntryDate,
        },
      });
    });

    await taxPayablesService.syncPayablesForPeriods(userId, [period]);

    const data = await salesService.getById(userId, updated.id);
    return {
      action,
      status: undoStatus,
      data,
    };
  },
};
