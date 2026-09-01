import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_SLOW_MOVING_DAYS,
  INVENTORY_SLOW_MOVING_GRACE_DAYS,
  INVENTORY_VELOCITY_DAYS,
  computeInventoryLineValue,
} from "../../constants/inventory";
import {
  PERCENT,
  VAT_RATE_PERCENT,
  INVENTORY_MOVING_LOW_STOCK_SHARE_PERCENT,
  PERCENT_TWO_DECIMAL_ROUND,
  MARGIN_PERCENT_NUMERATOR,
} from "../../constants/percentages";
import {
  initialSaleStatusForPaymentType,
  isSettledOnCreatePaymentType,
  PAYMENT_TYPE_CASH,
} from "../../constants/salePaymentRules";
import {
  initialInvoiceAmountPaid,
  invoiceAmountPaidFromSingle,
  invoiceAmountPaidToJson,
} from "../../constants/invoiceAmountPaid";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { ledgerPostingService } from "../../services/ledgerPostingService";
import { resolveSettlementBankCode } from "../../utils/settlementBank";
import { calendarPeriodFromDate } from "../../utils/dateRangeQuery";
import { taxPayablesService } from "./taxPayablesService";

const EXPENSE_COUNTER_ID = "expense_number";

const activeInventoryWhere = { deletedAt: null } as const;

/** 1 + VAT rate (e.g. 1.075) — Base = Total / divisor for VAT-inclusive. */
const VAT_INCLUSIVE_DIVISOR = 1 + VAT_RATE_PERCENT / PERCENT;

/** Cash and Transfer settle on create for inventory-linked sales (posts to Cash/Bank, not AR). */
function isInventoryLinkedSaleSettledOnCreate(paymentType: string): boolean {
  return isSettledOnCreatePaymentType(paymentType);
}

async function finalizeLinkedSaleLedger(
  userId: string,
  saleId: string,
): Promise<void> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, userId },
  });
  if (!sale) return;
  await ledgerPostingService.postSaleRecognition(userId, sale);
  await taxPayablesService.syncPayablesForPeriods(userId, [
    calendarPeriodFromDate(sale.saleDate),
  ]);
}

async function finalizeLinkedExpenseLedger(
  userId: string,
  expenseId: string,
): Promise<void> {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
  });
  if (!expense) return;
  await ledgerPostingService.postExpenseRecognition(userId, expense);
  await taxPayablesService.syncPayablesForPeriods(userId, [
    calendarPeriodFromDate(expense.expenseDate),
  ]);
}

async function createLinkedSaleInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  input: {
    baseAmount: Decimal;
    description: string;
    category: string | null;
    customerName: string | null;
    customerId: string | null;
    paymentType: string;
    saleDate: Date;
    invoiceDueDate?: Date | null;
    vatableIncome: boolean;
    vatInclusive?: boolean;
    serviceIncome: boolean;
    bankCode?: string | null;
    fullyPaid?: boolean;
  },
) {
  const userRow = await tx.user.findUnique({
    where: { id: userId },
  });
  if (!userRow) throw new Error("User not found");
  const nextNum =
    Number((userRow as { nextSaleNumber?: number }).nextSaleNumber) || 1;
  await tx.$executeRaw`
    UPDATE "User" SET next_sale_number = ${nextNum + 1} WHERE id = ${userId}
  `;

  const entered = input.baseAmount;
  const vatInclusive = Boolean(input.vatInclusive);
  const vatableIncome = Boolean(input.vatableIncome);
  if (vatableIncome && vatInclusive) {
    throw new HttpReplyError(
      400,
      "vatableIncome and vatInclusive cannot both be true. Use vatInclusive for VAT-inclusive amounts, or vatableIncome to add VAT on a net amount.",
    );
  }

  let amount: Decimal;
  let vatRate: Decimal;
  let vatAmount: Decimal;
  let totalAmount: Decimal;

  if (vatInclusive) {
    // Gross entered: base = total / 1.075; vat = total − base (same as sales).
    totalAmount = new Decimal(normalizeMoneyAmount(Number(entered)));
    const base = totalAmount.div(VAT_INCLUSIVE_DIVISOR);
    amount = new Decimal(normalizeMoneyAmount(Number(base)));
    vatAmount = new Decimal(
      normalizeMoneyAmount(Number(totalAmount.sub(amount))),
    );
    // Keep total = base + vat exactly (prefer entered gross as total).
    const reconciledTotal = amount.add(vatAmount);
    if (Math.abs(Number(reconciledTotal) - Number(totalAmount)) >= 0.02) {
      totalAmount = new Decimal(normalizeMoneyAmount(Number(reconciledTotal)));
      vatAmount = totalAmount.sub(amount);
    }
    vatRate = new Decimal(VAT_RATE_PERCENT);
  } else if (vatableIncome) {
    amount = entered;
    vatRate = new Decimal(VAT_RATE_PERCENT);
    vatAmount = new Decimal(
      normalizeMoneyAmount(Number(entered.mul(VAT_RATE_PERCENT / PERCENT))),
    );
    totalAmount = amount.add(vatAmount);
  } else {
    amount = entered;
    vatRate = new Decimal(0);
    vatAmount = new Decimal(0);
    totalAmount = entered;
  }

  const invoiceDueDate = input.invoiceDueDate ?? null;
  const paymentType = input.paymentType.trim();
  const settledOnCreate =
    input.fullyPaid === true ||
    (input.fullyPaid !== false &&
      isInventoryLinkedSaleSettledOnCreate(paymentType));
  const invoiceAmountPaid = initialInvoiceAmountPaid(
    paymentType,
    Number(totalAmount),
    { fullyPaid: settledOnCreate },
  );
  const status = initialSaleStatusForPaymentType(paymentType, {
    invoiceAmountPaid,
    totalAmount: Number(totalAmount),
    invoiceDueDate,
    fullyPaid: settledOnCreate,
  });
  const settlementBankCode = await resolveSettlementBankCode(
    userId,
    paymentType,
    null,
    input.bankCode,
    tx,
  );

  const sale = await tx.sale.create({
    data: {
      userId,
      createdById: userId,
      invoiceNumber: String(nextNum),
      description: input.description,
      category: input.category,
      customerName: input.customerName,
      customerId: input.customerId,
      amount,
      vatInclusive,
      vatRate,
      vatAmount,
      totalAmount,
      paymentType,
      saleDate: input.saleDate,
      invoiceDueDate,
      invoiceAmountPaid: invoiceAmountPaidToJson(invoiceAmountPaid),
      vatableIncome,
      serviceIncome: input.serviceIncome,
      status,
      settlementBankCode,
    },
  });
  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    amount: d(sale.amount),
    vatInclusive: sale.vatInclusive,
    vatAmount: d(sale.vatAmount),
    totalAmount: d(sale.totalAmount),
  };
}

async function createLinkedExpenseInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  input: {
    totalAmount: Decimal;
    description: string;
    category: string;
    expenseDate: Date;
    supplierName?: string | null;
    supplierId?: string | null;
  },
) {
  const counter = await tx.counter.upsert({
    where: { id: EXPENSE_COUNTER_ID },
    create: { id: EXPENSE_COUNTER_ID, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  const expenseNumber = `EXP-${String(counter.lastNumber).padStart(3, "0")}`;
  const expense = await tx.expense.create({
    data: {
      userId,
      createdById: userId,
      expenseNumber,
      description: input.description,
      category: input.category,
      amount: input.totalAmount,
      vatInclusive: false,
      vatAmount: null,
      totalAmount: input.totalAmount,
      supplierName: input.supplierName ?? null,
      supplierId: input.supplierId ?? null,
      expenseDate: input.expenseDate,
      // Stock purchases are settled when recorded.
      paymentType: PAYMENT_TYPE_CASH,
      invoiceAmountPaid: invoiceAmountPaidToJson(
        invoiceAmountPaidFromSingle(Number(input.totalAmount), PAYMENT_TYPE_CASH),
      ),
      status: initialSaleStatusForPaymentType(PAYMENT_TYPE_CASH),
    },
  });
  return {
    id: expense.id,
    expenseNumber: expense.expenseNumber,
    totalAmount: d(expense.totalAmount),
  };
}

function d(v: Decimal | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

function dec(n: number): Decimal {
  return new Decimal(n);
}

async function soldQtyInPeriod(
  inventoryItemId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const rows = await prisma.inventoryMovement.findMany({
    where: {
      inventoryItemId,
      type: INVENTORY_MOVEMENT_TYPES.SALE,
      createdAt: { gte: from, lte: to },
    },
    select: { quantityDelta: true },
  });
  return rows.reduce((s, r) => s + Math.abs(d(r.quantityDelta)), 0);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / MS_PER_DAY;
}

function isWithinSlowMovingGracePeriod(createdAt: Date, now: Date): boolean {
  return daysSince(createdAt, now) < INVENTORY_SLOW_MOVING_GRACE_DAYS;
}

/** Last activity reference for slow-moving: most recent sale, else when stock was introduced. */
function slowMovingReferenceDate(
  lastSaleAt: Date | null,
  createdAt: Date,
): Date {
  return lastSaleAt ?? createdAt;
}

function isSlowMovingStock(
  item: { lastSaleAt: Date | null; createdAt: Date },
  now: Date,
  slowCutoff: Date,
): boolean {
  if (isWithinSlowMovingGracePeriod(item.createdAt, now)) return false;
  return slowMovingReferenceDate(item.lastSaleAt, item.createdAt) < slowCutoff;
}

async function findInventoryItemByName(
  userId: string,
  name: string,
  excludeItemId?: string,
) {
  const normalized = name.trim();
  if (!normalized) return null;
  const existing = await prisma.inventoryItem.findMany({
    where: { userId, ...activeInventoryWhere },
    select: { id: true, name: true },
  });
  const lower = normalized.toLowerCase();
  return (
    existing.find(
      (row) =>
        row.name.trim().toLowerCase() === lower &&
        row.id !== excludeItemId,
    ) ?? null
  );
}

async function assertUniqueInventoryName(
  userId: string,
  name: string,
  excludeItemId?: string,
): Promise<void> {
  const duplicate = await findInventoryItemByName(userId, name, excludeItemId);
  if (duplicate) {
    throw new HttpReplyError(
      409,
      "An inventory item with this name already exists",
    );
  }
}

export const inventoryService = {
  async overview(userId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: { userId, ...activeInventoryWhere },
    });

    let stockCost = 0;
    let potentialRevenue = 0;
    let marginNumerator = 0;
    let marginDenominator = 0;

    const lowStockItems: Array<{
      id: string;
      name: string;
      category: string;
      quantity: number;
      lowStockAlertLevel: number;
    }> = [];

    const now = new Date();
    const slowCutoff = new Date(now);
    slowCutoff.setDate(slowCutoff.getDate() - INVENTORY_SLOW_MOVING_DAYS);
    const velocityFrom = new Date(now);
    velocityFrom.setDate(velocityFrom.getDate() - INVENTORY_VELOCITY_DAYS);

    const slowMoving: Array<{
      id: string;
      name: string;
      category: string;
      quantity: number;
      lastSaleAt: string | null;
    }> = [];

    const movingLowCandidates: typeof slowMoving = [];

    for (const it of items) {
      const qty = d(it.quantity);
      const cost = d(it.purchaseCost);
      const price = d(it.sellingPrice);
      const alert = d(it.lowStockAlertLevel);

      stockCost += computeInventoryLineValue(qty, cost);
      potentialRevenue += qty * price;
      if (qty > 0 && price > 0) {
        marginNumerator += qty * (price - cost);
        marginDenominator += qty * price;
      }

      if (qty <= alert) {
        lowStockItems.push({
          id: it.id,
          name: it.name,
          category: it.category,
          quantity: qty,
          lowStockAlertLevel: alert,
        });
      }

      if (qty > 0) {
        const last = it.lastSaleAt;
        if (isSlowMovingStock(it, now, slowCutoff)) {
          slowMoving.push({
            id: it.id,
            name: it.name,
            category: it.category,
            quantity: qty,
            lastSaleAt: last ? last.toISOString() : null,
          });
        }
      }
    }

    const saleAgg = await prisma.inventoryMovement.groupBy({
      by: ["inventoryItemId"],
      where: {
        userId,
        type: INVENTORY_MOVEMENT_TYPES.SALE,
        createdAt: { gte: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000) },
      },
      _sum: { quantityDelta: true },
    });
    const soldByItem = new Map<string, number>();
    for (const row of saleAgg) {
      soldByItem.set(
        row.inventoryItemId,
        Math.abs(d(row._sum.quantityDelta)),
      );
    }

    const topSelling = [...soldByItem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, unitsSold]) => {
        const it = items.find((i) => i.id === id);
        return {
          inventoryItemId: id,
          name: it?.name ?? "",
          category: it?.category ?? "",
          unitsSoldLast120Days: unitsSold,
        };
      });

    for (const it of items) {
      const qty = d(it.quantity);
      const alert = d(it.lowStockAlertLevel);
      if (qty <= 0 || qty <= alert) continue;
      if (isWithinSlowMovingGracePeriod(it.createdAt, now)) continue;
      const sold60 = await soldQtyInPeriod(it.id, velocityFrom, now);
      const threshold = Math.max(
        1,
        Math.floor(qty * (INVENTORY_MOVING_LOW_STOCK_SHARE_PERCENT / PERCENT)),
      );
      if (sold60 < threshold) {
        movingLowCandidates.push({
          id: it.id,
          name: it.name,
          category: it.category,
          quantity: qty,
          lastSaleAt: it.lastSaleAt ? it.lastSaleAt.toISOString() : null,
        });
      }
    }

    const potentialProfit = potentialRevenue - stockCost;
    const averageMarginPct =
      marginDenominator > 0
        ? (marginNumerator / marginDenominator) * PERCENT
        : 0;

    return {
      totalStockValue: stockCost,
      lowStockAlertCount: lowStockItems.length,
      lowStockItems,
      topSelling,
      slowMoving: slowMoving.slice(0, 20),
      movingLowPreview: movingLowCandidates.slice(0, 20),
      stats: {
        potentialRevenue,
        stockCost,
        potentialProfit,
        averageMarginPct:
          Math.round(averageMarginPct * PERCENT_TWO_DECIMAL_ROUND) /
          PERCENT_TWO_DECIMAL_ROUND,
      },
    };
  },

  async alerts(userId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: { userId, ...activeInventoryWhere },
    });
    const now = new Date();
    const velocityFrom = new Date(now);
    velocityFrom.setDate(velocityFrom.getDate() - INVENTORY_VELOCITY_DAYS);

    const runningLow = items.filter((it) => d(it.quantity) <= d(it.lowStockAlertLevel));

    const movingLow: typeof runningLow = [];
    for (const it of items) {
      const qty = d(it.quantity);
      const alert = d(it.lowStockAlertLevel);
      if (qty <= 0 || qty <= alert) continue;
      if (isWithinSlowMovingGracePeriod(it.createdAt, now)) continue;
      const sold60 = await soldQtyInPeriod(it.id, velocityFrom, now);
      const threshold = Math.max(
        1,
        Math.floor(qty * (INVENTORY_MOVING_LOW_STOCK_SHARE_PERCENT / PERCENT)),
      );
      if (sold60 < threshold) movingLow.push(it);
    }

    let stockValueTiedUp = 0;
    let quantitySum = 0;
    let lastSaleMax: Date | null = null;

    for (const it of runningLow) {
      const qty = d(it.quantity);
      stockValueTiedUp += computeInventoryLineValue(qty, d(it.purchaseCost));
      quantitySum += qty;
      if (it.lastSaleAt && (!lastSaleMax || it.lastSaleAt > lastSaleMax)) {
        lastSaleMax = it.lastSaleAt;
      }
    }

    return {
      alertItemCount: runningLow.length + movingLow.length,
      runningLowCount: runningLow.length,
      movingLowCount: movingLow.length,
      runningLow: runningLow.map((it) => ({
        id: it.id,
        name: it.name,
        category: it.category,
        quantity: d(it.quantity),
        lowStockAlertLevel: d(it.lowStockAlertLevel),
        stockValue: computeInventoryLineValue(d(it.quantity), d(it.purchaseCost)),
        lastSaleAt: it.lastSaleAt ? it.lastSaleAt.toISOString() : null,
      })),
      movingLow: movingLow.map((it) => ({
        id: it.id,
        name: it.name,
        category: it.category,
        quantity: d(it.quantity),
        lowStockAlertLevel: d(it.lowStockAlertLevel),
        stockValue: computeInventoryLineValue(d(it.quantity), d(it.purchaseCost)),
        lastSaleAt: it.lastSaleAt ? it.lastSaleAt.toISOString() : null,
      })),
      stats: {
        stockValueTiedUp,
        quantity: quantitySum,
        lastSaleDate: lastSaleMax ? lastSaleMax.toISOString() : null,
      },
    };
  },

  async listItems(
    userId: string,
    opts?: {
      page?: number;
      limit?: number;
      category?: string;
      lowStockOnly?: boolean;
    },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where: {
      userId: string;
      category?: string;
      deletedAt: null;
    } = { userId, ...activeInventoryWhere };
    if (opts?.category?.trim()) where.category = opts.category.trim();

    let rows = await prisma.inventoryItem.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    if (opts?.lowStockOnly) {
      rows = rows.filter((it) => d(it.quantity) <= d(it.lowStockAlertLevel));
    }

    const total = rows.length;
    const list = rows.slice((page - 1) * limit, (page - 1) * limit + limit);

    const lastMove = await prisma.inventoryMovement.findMany({
      where: {
        inventoryItemId: { in: list.map((i) => i.id) },
      },
      orderBy: { createdAt: "desc" },
      distinct: ["inventoryItemId"],
      select: {
        inventoryItemId: true,
        createdAt: true,
        type: true,
        quantityDelta: true,
      },
    });
    const lastByItem = new Map(lastMove.map((m) => [m.inventoryItemId, m]));

    return {
      items: list.map((it) => {
        const qty = d(it.quantity);
        const alert = d(it.lowStockAlertLevel);
        const lm = lastByItem.get(it.id);
        return {
          id: it.id,
          name: it.name,
          category: it.category,
          purchaseCost: d(it.purchaseCost),
          sellingPrice: d(it.sellingPrice),
          quantity: qty,
          lowStockAlertLevel: alert,
          isLowStock: qty <= alert,
          stockValue: computeInventoryLineValue(qty, d(it.purchaseCost)),
          lastMovementAt: lm ? lm.createdAt.toISOString() : null,
          lastMovementType: lm?.type ?? null,
        };
      }),
      total,
      page,
      limit,
    };
  },

  async getItemDetail(userId: string, itemId: string) {
    const it = await prisma.inventoryItem.findFirst({
      where: { id: itemId, userId, ...activeInventoryWhere },
    });
    if (!it) return null;

    const qty = d(it.quantity);
    const cost = d(it.purchaseCost);
    const price = d(it.sellingPrice);
    const revenueIfAllSold = qty * price;
    const costIfAllSold = qty * cost;
    const profitIfAllSold = revenueIfAllSold - costIfAllSold;

    const recentMovements = await prisma.inventoryMovement.findMany({
      where: { inventoryItemId: itemId, userId },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    return {
      id: it.id,
      name: it.name,
      category: it.category,
      purchaseCost: cost,
      sellingPrice: price,
      quantity: qty,
      lowStockAlertLevel: d(it.lowStockAlertLevel),
      supplierName: it.supplierName,
      supplierId: it.supplierId,
      isLowStock: qty <= d(it.lowStockAlertLevel),
      lastSaleAt: it.lastSaleAt ? it.lastSaleAt.toISOString() : null,
      marketAnalysis: {
        revenueIfAllSold,
        costIfAllSold,
        profitIfAllSold,
        marginPct:
          revenueIfAllSold > 0
            ? Math.round(
                (profitIfAllSold / revenueIfAllSold) * MARGIN_PERCENT_NUMERATOR,
              ) / PERCENT_TWO_DECIMAL_ROUND
            : 0,
      },
      recentMovements: recentMovements.map((m) => ({
        id: m.id,
        type: m.type,
        quantityDelta: d(m.quantityDelta),
        quantityAfter: d(m.quantityAfter),
        note: m.note,
        createdAt: m.createdAt.toISOString(),
        inventorySaleId: m.inventorySaleId,
      })),
    };
  },

  async listMovements(
    userId: string,
    opts?: {
      page?: number;
      limit?: number;
      inventoryItemId?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where: {
      userId: string;
      inventoryItemId?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = { userId };
    if (opts?.inventoryItemId) where.inventoryItemId = opts.inventoryItemId;
    if (opts?.dateFrom || opts?.dateTo) {
      where.createdAt = {};
      if (opts.dateFrom) where.createdAt.gte = opts.dateFrom;
      if (opts.dateTo) where.createdAt.lte = opts.dateTo;
    }

    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        include: {
          inventoryItem: { select: { id: true, name: true, category: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return {
      movements: movements.map((m) => ({
        id: m.id,
        inventoryItemId: m.inventoryItemId,
        itemName: m.inventoryItem.name,
        itemCategory: m.inventoryItem.category,
        type: m.type,
        quantityDelta: d(m.quantityDelta),
        quantityAfter: d(m.quantityAfter),
        note: m.note,
        createdAt: m.createdAt.toISOString(),
        inventorySaleId: m.inventorySaleId,
      })),
      total,
      page,
      limit,
    };
  },

  async restock(
    userId: string,
    itemId: string,
    data: { quantity: number; note?: string },
  ) {
    const qty = data.quantity;
    if (qty <= 0) throw new Error("quantity must be positive");

    await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: itemId, userId, ...activeInventoryWhere },
      });
      if (!item) throw new Error("Inventory item not found");
      const newQty = d(item.quantity) + qty;
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { quantity: dec(newQty) },
      });
      await tx.inventoryMovement.create({
        data: {
          userId,
          inventoryItemId: itemId,
          type: INVENTORY_MOVEMENT_TYPES.RESTOCK,
          quantityDelta: dec(qty),
          quantityAfter: dec(newQty),
          note: data.note?.trim() || null,
        },
      });
    });

    return inventoryService.getItemDetail(userId, itemId);
  },

  async adjustment(
    userId: string,
    itemId: string,
    data: {
      direction: "in" | "out";
      quantity: number;
      note?: string;
      createSalesInvoice?: boolean;
      paymentType?: string;
      saleDate?: string;
      invoiceDueDate?: string | null;
      vatableIncome?: boolean;
      vatInclusive?: boolean;
      serviceIncome?: boolean;
      saleCategory?: string;
      expenseCategory?: string;
      bankCode?: string | null;
    },
  ) {
    const qty = data.quantity;
    if (qty <= 0) throw new Error("quantity must be positive");
    if (data.direction !== "in" && data.direction !== "out") {
      throw new Error("direction must be in or out");
    }

    const { linkedSale, linkedExpense } = await prisma.$transaction(
      async (tx) => {
        const item = await tx.inventoryItem.findFirst({
          where: { id: itemId, userId, ...activeInventoryWhere },
        });
        if (!item) throw new Error("Inventory item not found");
        const current = d(item.quantity);
        const delta = data.direction === "in" ? qty : -qty;
        const newQty = current + delta;
        if (newQty < 0) throw new Error("Insufficient stock for adjustment out");
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: { quantity: dec(newQty) },
        });
        await tx.inventoryMovement.create({
          data: {
            userId,
            inventoryItemId: itemId,
            type:
              data.direction === "in"
                ? INVENTORY_MOVEMENT_TYPES.ADJUSTMENT_IN
                : INVENTORY_MOVEMENT_TYPES.ADJUSTMENT_OUT,
            quantityDelta: dec(delta),
            quantityAfter: dec(newQty),
            note: data.note?.trim() || null,
          },
        });

        const costTotal = item.purchaseCost.mul(qty);
        const dateStr =
          data.saleDate?.trim() || new Date().toISOString().split("T")[0];
        const bookDate = new Date(`${dateStr}T12:00:00.000Z`);
        const noteSuffix = data.note?.trim()
          ? ` — ${data.note.trim()}`
          : "";

        let linkedSale: Awaited<ReturnType<typeof createLinkedSaleInTx>> | null =
          null;
        let linkedExpense: Awaited<
          ReturnType<typeof createLinkedExpenseInTx>
        > | null = null;

        if (data.createSalesInvoice) {
          if (data.direction === "out") {
            const expRaw = data.expenseCategory?.trim();
            const expCat =
              expRaw && expRaw.length > 0 ? expRaw : "Other";
            linkedExpense = await createLinkedExpenseInTx(tx, userId, {
              totalAmount: costTotal,
              description: `Inventory adjustment out: ${item.name} (${qty} units)${noteSuffix}`,
              category: expCat,
              expenseDate: bookDate,
              supplierName: item.supplierName,
              supplierId: item.supplierId,
            });
          } else {
            const rawSaleCat = data.saleCategory?.trim();
            const saleCat =
              rawSaleCat && rawSaleCat.length > 0 ? rawSaleCat : "Other";
            linkedSale = await createLinkedSaleInTx(tx, userId, {
              baseAmount: costTotal,
              description: `Inventory adjustment in: ${item.name} (${qty} units)${noteSuffix}`,
              category: saleCat,
              customerName: null,
              customerId: null,
              paymentType: data.paymentType?.trim() || "Cash",
              saleDate: bookDate,
              invoiceDueDate:
                data.invoiceDueDate != null &&
                String(data.invoiceDueDate).trim() !== ""
                  ? new Date(
                      `${String(data.invoiceDueDate).trim().slice(0, 10)}T12:00:00.000Z`,
                    )
                  : null,
              vatableIncome: data.vatableIncome === true,
              vatInclusive: data.vatInclusive === true,
              serviceIncome: data.serviceIncome !== false,
              bankCode: data.bankCode,
            });
          }
        }

        return { linkedSale, linkedExpense };
      },
    );

    if (linkedSale?.id) {
      await finalizeLinkedSaleLedger(userId, linkedSale.id);
    }
    if (linkedExpense?.id) {
      await finalizeLinkedExpenseLedger(userId, linkedExpense.id);
    }

    const detail = await inventoryService.getItemDetail(userId, itemId);
    if (!detail) return null;
    const out: typeof detail & {
      linkedSale?: NonNullable<typeof linkedSale>;
      linkedExpense?: NonNullable<typeof linkedExpense>;
    } = { ...detail };
    if (linkedSale) out.linkedSale = linkedSale;
    if (linkedExpense) out.linkedExpense = linkedExpense;
    return out;
  },

  async addItem(
    userId: string,
    data: {
      name: string;
      category: string;
      purchaseCost: number;
      sellingPrice: number;
      openingQuantity: number;
      lowStockAlertLevel: number;
      supplierName?: string;
      supplierId?: string;
    },
  ) {
    const opening = data.openingQuantity;
    if (opening < 0) throw new Error("openingQuantity must be non-negative");

    await assertUniqueInventoryName(userId, data.name);

    const item = await prisma.$transaction(async (tx) => {
      const row = await tx.inventoryItem.create({
        data: {
          userId,
          name: data.name.trim(),
          category: data.category.trim(),
          purchaseCost: dec(data.purchaseCost),
          sellingPrice: dec(data.sellingPrice),
          quantity: dec(opening),
          lowStockAlertLevel: dec(data.lowStockAlertLevel),
          supplierName: data.supplierName?.trim() || null,
          supplierId: data.supplierId?.trim() || null,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          userId,
          inventoryItemId: row.id,
          type: INVENTORY_MOVEMENT_TYPES.OPENING,
          quantityDelta: dec(opening),
          quantityAfter: dec(opening),
          note: "Opening stock",
        },
      });
      return row;
    });

    return inventoryService.getItemDetail(userId, item.id);
  },

  async updateItem(
    userId: string,
    itemId: string,
    data: Partial<{
      name: string;
      category: string;
      purchaseCost: number;
      sellingPrice: number;
      lowStockAlertLevel: number;
      supplierName: string | null;
      supplierId: string | null;
    }>,
  ) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id: itemId, userId, ...activeInventoryWhere },
    });
    if (!existing) return null;

    if (data.name != null) {
      await assertUniqueInventoryName(userId, data.name, itemId);
    }

    const updateData: Record<string, unknown> = {};
    if (data.name != null) updateData.name = data.name.trim();
    if (data.category != null) updateData.category = data.category.trim();
    if (data.purchaseCost != null)
      updateData.purchaseCost = dec(data.purchaseCost);
    if (data.sellingPrice != null)
      updateData.sellingPrice = dec(data.sellingPrice);
    if (data.lowStockAlertLevel != null)
      updateData.lowStockAlertLevel = dec(data.lowStockAlertLevel);
    if (data.supplierName !== undefined) {
      updateData.supplierName = data.supplierName?.trim() || null;
    }
    if (data.supplierId !== undefined) {
      updateData.supplierId = data.supplierId?.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return inventoryService.getItemDetail(userId, itemId);
    }

    await prisma.inventoryItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return inventoryService.getItemDetail(userId, itemId);
  },

  async deleteItem(userId: string, itemId: string): Promise<"ok" | "not_found"> {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id: itemId, userId, ...activeInventoryWhere },
    });
    if (!existing) return "not_found";

    await prisma.$transaction(async (tx) => {
      const remainingQty = d(existing.quantity);
      if (remainingQty > 0) {
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: { quantity: dec(0) },
        });
        await tx.inventoryMovement.create({
          data: {
            userId,
            inventoryItemId: itemId,
            type: INVENTORY_MOVEMENT_TYPES.ADJUSTMENT_OUT,
            quantityDelta: dec(-remainingQty),
            quantityAfter: dec(0),
            note: "Stock written off on product deletion",
          },
        });
      }

      const saleLineCount = await tx.inventorySaleLine.count({
        where: { inventoryItemId: itemId },
      });

      if (saleLineCount > 0) {
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: { deletedAt: new Date() },
        });
      } else {
        await tx.inventoryItem.delete({
          where: { id: itemId },
        });
      }
    });

    return "ok";
  },

  async sellFromInventory(
    userId: string,
    data: {
      lines: Array<{ inventoryItemId: string; quantity: number }>;
      customerName?: string;
      customerId?: string;
      createSalesInvoice?: boolean;
      paymentType?: string;
      saleDate?: string;
      invoiceDueDate?: string | null;
      vatableIncome?: boolean;
      vatInclusive?: boolean;
      serviceIncome?: boolean;
      saleCategory?: string;
      bankCode?: string | null;
    },
  ) {
    if (!data.lines?.length) throw new Error("lines required");

    const { invSaleId, linkedSale } = await prisma.$transaction(async (tx) => {
      let totalAmount = new Decimal(0);
      const lineRows: Array<{
        inventoryItemId: string;
        quantity: Decimal;
        unitSellingPrice: Decimal;
        unitCost: Decimal;
        lineTotal: Decimal;
      }> = [];
      const descParts: string[] = [];

      for (const line of data.lines) {
        const qty = line.quantity;
        if (qty <= 0) throw new Error("quantity must be positive");
        const item = await tx.inventoryItem.findFirst({
          where: { id: line.inventoryItemId, userId, ...activeInventoryWhere },
        });
        if (!item) throw new Error(`Item not found: ${line.inventoryItemId}`);
        const current = d(item.quantity);
        if (current < qty) throw new Error(`Insufficient stock for ${item.name}`);
        const unitPrice = item.sellingPrice;
        const unitCost = item.purchaseCost;
        const lineTotal = unitPrice.mul(qty);
        totalAmount = totalAmount.add(lineTotal);
        descParts.push(`${item.name} × ${qty}`);
        lineRows.push({
          inventoryItemId: item.id,
          quantity: dec(qty),
          unitSellingPrice: unitPrice,
          unitCost,
          lineTotal,
        });
      }

      const invSale = await tx.inventorySale.create({
        data: {
          userId,
          totalAmount,
          customerName: data.customerName?.trim() || null,
          customerId: data.customerId?.trim() || null,
          lines: {
            create: lineRows.map((l) => ({
              inventoryItemId: l.inventoryItemId,
              quantity: l.quantity,
              unitSellingPrice: l.unitSellingPrice,
              unitCost: l.unitCost,
              lineTotal: l.lineTotal,
            })),
          },
        },
      });

      const soldAt = new Date();

      for (const l of lineRows) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: l.inventoryItemId },
        });
        const newQty = d(item.quantity) - d(l.quantity);
        await tx.inventoryItem.update({
          where: { id: l.inventoryItemId },
          data: {
            quantity: dec(newQty),
            lastSaleAt: soldAt,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            userId,
            inventoryItemId: l.inventoryItemId,
            type: INVENTORY_MOVEMENT_TYPES.SALE,
            quantityDelta: dec(-d(l.quantity)),
            quantityAfter: dec(newQty),
            inventorySaleId: invSale.id,
            note: "Inventory sale",
          },
        });
      }

      let linkedSale: Awaited<ReturnType<typeof createLinkedSaleInTx>> | null =
        null;
      if (data.createSalesInvoice) {
        const dateStr =
          data.saleDate?.trim() || soldAt.toISOString().split("T")[0];
        const saleDate = new Date(`${dateStr}T12:00:00.000Z`);
        const rawInvSaleCat = data.saleCategory?.trim();
        const invSaleCat =
          rawInvSaleCat && rawInvSaleCat.length > 0
            ? rawInvSaleCat
            : "Product Sales";
        linkedSale = await createLinkedSaleInTx(tx, userId, {
          baseAmount: totalAmount,
          description: `Inventory sale: ${descParts.join("; ")}`,
          category: invSaleCat,
          customerName: data.customerName?.trim() || null,
          customerId: data.customerId?.trim() || null,
          paymentType: data.paymentType?.trim() || "Cash",
          saleDate,
          invoiceDueDate:
            data.invoiceDueDate != null &&
            String(data.invoiceDueDate).trim() !== ""
              ? new Date(
                  `${String(data.invoiceDueDate).trim().slice(0, 10)}T12:00:00.000Z`,
                )
              : null,
          vatableIncome: data.vatableIncome === true,
          vatInclusive: data.vatInclusive === true,
          serviceIncome: data.serviceIncome !== false,
          bankCode: data.bankCode,
        });
      }

      return { invSaleId: invSale.id, linkedSale };
    });

    if (linkedSale?.id) {
      await finalizeLinkedSaleLedger(userId, linkedSale.id);
    }

    const sale = await prisma.inventorySale.findFirst({
      where: { id: invSaleId, userId },
      include: {
        lines: {
          include: { inventoryItem: { select: { name: true, category: true } } },
        },
      },
    });
    if (!sale) return null;
    const out: {
      id: string;
      soldAt: string;
      totalAmount: number;
      customerName: string | null;
      customerId: string | null;
      lines: Array<{
        inventoryItemId: string;
        itemName: string;
        category: string;
        quantity: number;
        unitSellingPrice: number;
        unitCost: number;
        lineTotal: number;
      }>;
      linkedSale?: {
        id: string;
        invoiceNumber: string;
        amount: number;
        vatAmount: number;
        totalAmount: number;
      };
    } = {
      id: sale.id,
      soldAt: sale.soldAt.toISOString(),
      totalAmount: d(sale.totalAmount),
      customerName: sale.customerName,
      customerId: sale.customerId,
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
    if (linkedSale) out.linkedSale = linkedSale;
    return out;
  },

  async listSales(
    userId: string,
    opts?: { page?: number; limit?: number; dateFrom?: Date; dateTo?: Date },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where: {
      userId: string;
      soldAt?: { gte?: Date; lte?: Date };
    } = { userId };
    if (opts?.dateFrom || opts?.dateTo) {
      where.soldAt = {};
      if (opts.dateFrom) where.soldAt.gte = opts.dateFrom;
      if (opts.dateTo) where.soldAt.lte = opts.dateTo;
    }

    const [sales, total] = await Promise.all([
      prisma.inventorySale.findMany({
        where,
        include: {
          lines: {
            include: {
              inventoryItem: { select: { id: true, name: true, category: true } },
            },
          },
        },
        orderBy: { soldAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventorySale.count({ where }),
    ]);

    return {
      sales: sales.map((s) => ({
        id: s.id,
        soldAt: s.soldAt.toISOString(),
        totalAmount: d(s.totalAmount),
        customerName: s.customerName,
        customerId: s.customerId,
        lines: s.lines.map((l) => ({
          inventoryItemId: l.inventoryItemId,
          itemName: l.inventoryItem.name,
          category: l.inventoryItem.category,
          quantity: d(l.quantity),
          unitSellingPrice: d(l.unitSellingPrice),
          unitCost: d(l.unitCost),
          lineTotal: d(l.lineTotal),
        })),
      })),
      total,
      page,
      limit,
    };
  },
};
