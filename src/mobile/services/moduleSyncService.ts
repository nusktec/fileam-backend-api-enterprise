import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  DEFAULT_PURCHASE_ORIGIN,
  inferVatTag,
  type PurchaseKind,
  type PurchaseOrigin,
  type VatTag,
} from "../../constants/purchaseDescriptors";
import {
  initialSaleStatusForPaymentType,
  PAYMENT_TYPE_CASH,
} from "../../constants/salePaymentRules";
import {
  initialInvoiceAmountPaid,
  invoiceAmountPaidFromSingle,
  invoiceAmountPaidToJson,
} from "../../constants/invoiceAmountPaid";
import { resolveSettlementBankCode } from "../../utils/settlementBank";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

const EXPENSE_COUNTER_ID = "expense_number";

function d(value: Decimal | number | string): number {
  return Number(value);
}

function dec(value: number): Decimal {
  return new Decimal(normalizeMoneyAmount(value));
}

async function nextExpenseNumberInTx(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { id: EXPENSE_COUNTER_ID },
    create: { id: EXPENSE_COUNTER_ID, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `EXP-${String(counter.lastNumber).padStart(3, "0")}`;
}

async function nextSaleInvoiceNumberInTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string> {
  const userRow = await tx.user.findUnique({ where: { id: userId } });
  if (!userRow) throw new Error("User not found");
  const nextNum =
    Number((userRow as { nextSaleNumber?: number }).nextSaleNumber) || 1;
  await tx.$executeRaw`
    UPDATE "User" SET next_sale_number = ${nextNum + 1} WHERE id = ${userId}
  `;
  return String(nextNum);
}

/**
 * Shadow expense for asset/inventory purchases. Does not post ledger — the
 * source module already (or never) posted cash/bank.
 */
export async function syncPurchaseToExpense(
  userId: string,
  input: {
    amount: number;
    description: string;
    category: string;
    expenseType: string;
    expenseDate: Date;
    supplierName?: string | null;
    supplierId?: string | null;
    purchaseOrigin?: PurchaseOrigin;
    purchaseKind: PurchaseKind;
    vatTag?: VatTag;
    convertedToAssetId?: string | null;
    inventoryItemId?: string | null;
    createdById?: string;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ id: string; expenseNumber: string } | null> {
  if (!(input.amount > 0)) return null;

  if (input.convertedToAssetId) {
    const existing = await client.expense.findFirst({
      where: { convertedToAssetId: input.convertedToAssetId },
      select: { id: true, expenseNumber: true },
    });
    if (existing) return existing;
  }

  const total = dec(input.amount);
  const expenseNumber = await nextExpenseNumberInTx(
    client as Prisma.TransactionClient,
  );
  const paymentType = PAYMENT_TYPE_CASH;
  const vatTag = inferVatTag({ vatTag: input.vatTag });
  const expense = await client.expense.create({
    data: {
      userId,
      createdById: input.createdById ?? userId,
      expenseNumber,
      description: input.description,
      category: input.category,
      expenseType: input.expenseType,
      amount: total,
      vatInclusive: false,
      vatAmount: null,
      totalAmount: total,
      paymentType,
      supplierName: input.supplierName ?? null,
      supplierId: input.supplierId ?? null,
      expenseDate: input.expenseDate,
      invoiceAmountPaid: invoiceAmountPaidToJson(
        invoiceAmountPaidFromSingle(Number(total), paymentType),
      ),
      status: initialSaleStatusForPaymentType(paymentType),
      purchaseOrigin: input.purchaseOrigin ?? DEFAULT_PURCHASE_ORIGIN,
      purchaseKind: input.purchaseKind,
      vatTag,
      convertedToAssetId: input.convertedToAssetId ?? null,
      inventoryItemId: input.inventoryItemId ?? null,
    },
    select: { id: true, expenseNumber: true },
  });
  return expense;
}

/**
 * Shadow sale for asset/inventory sales. Skip ledger when the source already
 * posted (asset sale) or the caller did not request invoice recognition.
 */
export async function syncSaleRecord(
  userId: string,
  input: {
    amount: number;
    description: string;
    category: string | null;
    itemName?: string | null;
    customerName?: string | null;
    customerId?: string | null;
    saleDate: Date;
    paymentType?: string;
    inventorySaleId?: string | null;
    assetSaleId?: string | null;
    vatTag?: VatTag;
    vatableIncome?: boolean;
    vatInclusive?: boolean;
    serviceIncome?: boolean;
    createdById?: string;
    bankCode?: string | null;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ id: string; invoiceNumber: string } | null> {
  if (!(input.amount > 0)) return null;

  if (input.assetSaleId) {
    const existing = await client.sale.findFirst({
      where: { assetSaleId: input.assetSaleId },
      select: { id: true, invoiceNumber: true },
    });
    if (existing) return existing;
  }
  if (input.inventorySaleId) {
    const existing = await client.sale.findFirst({
      where: { inventorySaleId: input.inventorySaleId },
      select: { id: true, invoiceNumber: true },
    });
    if (existing) return existing;
  }

  const paymentType = (input.paymentType?.trim() || PAYMENT_TYPE_CASH).trim();
  const amount = dec(input.amount);
  const vatTag = inferVatTag({
    vatTag: input.vatTag,
    vatInclusive: input.vatInclusive,
    vatableIncome: input.vatableIncome,
  });
  const invoiceNumber = await nextSaleInvoiceNumberInTx(
    client as Prisma.TransactionClient,
    userId,
  );
  const settlementBankCode = await resolveSettlementBankCode(
    userId,
    paymentType,
    null,
    input.bankCode,
    client as Prisma.TransactionClient,
  );
  const totalNum = d(amount);
  const invoiceAmountPaid = initialInvoiceAmountPaid(paymentType, totalNum, {
    fullyPaid: true,
  });
  const sale = await client.sale.create({
    data: {
      userId,
      createdById: input.createdById ?? userId,
      invoiceNumber,
      description: input.description,
      itemName: input.itemName ?? null,
      category: input.category,
      customerName: input.customerName ?? null,
      customerId: input.customerId ?? null,
      amount,
      vatInclusive: Boolean(input.vatInclusive),
      vatRate: new Decimal(0),
      vatAmount: new Decimal(0),
      totalAmount: amount,
      paymentType,
      saleDate: input.saleDate,
      invoiceAmountPaid: invoiceAmountPaidToJson(invoiceAmountPaid),
      vatableIncome: Boolean(input.vatableIncome),
      serviceIncome: input.serviceIncome !== false,
      status: initialSaleStatusForPaymentType(paymentType, {
        invoiceAmountPaid,
        totalAmount: totalNum,
        fullyPaid: true,
      }),
      settlementBankCode,
      inventorySaleId: input.inventorySaleId ?? undefined,
      assetSaleId: input.assetSaleId ?? undefined,
      vatTag,
    },
    select: { id: true, invoiceNumber: true },
  });
  return sale;
}
