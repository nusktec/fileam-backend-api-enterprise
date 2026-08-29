/**
 * Reverse and repost sale/expense ledger entries when records change,
 * per payment_and_account_movement_logic.pdf (atomic, no stale AR/AP or bank lines).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import {
  LEDGER_REFERENCE_TYPES,
  LEDGER_STATUS,
} from "../constants/ledger";
import {
  coerceInvoiceAmountPaid,
  type InvoiceAmountPaid,
} from "../constants/invoiceAmountPaid";
import {
  isAsyncPaymentType,
  isInvoicePaymentType,
  isSalePaidStatus,
} from "../constants/salePaymentRules";
import { ledgerService } from "./ledgerService";
import { ledgerPostingService } from "./ledgerPostingService";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type SaleLedgerRow = {
  id: string;
  paymentType: string;
  status: string;
  amount: number | { toNumber?: () => number };
  vatAmount: number | { toNumber?: () => number } | null;
  totalAmount: number | { toNumber?: () => number };
  invoiceAmountPaid?: unknown;
  saleDate: Date;
  settlementBankCode?: string | null;
};

export type ExpenseLedgerRow = {
  id: string;
  paymentType: string;
  status: string;
  totalAmount: number | { toNumber?: () => number };
  invoiceAmountPaid?: unknown;
  expenseDate: Date;
  settlementBankCode?: string | null;
};

function num(value: number | { toNumber?: () => number }): number {
  return typeof value === "object" && typeof value.toNumber === "function"
    ? value.toNumber()
    : Number(value);
}

function recognitionChanged(
  previous: SaleLedgerRow | ExpenseLedgerRow,
  next: SaleLedgerRow | ExpenseLedgerRow,
): boolean {
  if (previous.paymentType !== next.paymentType) return true;
  if (previous.status !== next.status) return true;
  if (num(previous.totalAmount) !== num(next.totalAmount)) return true;
  if ("amount" in previous && "amount" in next) {
    if (num(previous.amount) !== num(next.amount)) return true;
    const pv = previous.vatAmount != null ? num(previous.vatAmount) : 0;
    const nv = next.vatAmount != null ? num(next.vatAmount) : 0;
    if (pv !== nv) return true;
  }
  return false;
}

async function reverseByReference(
  userId: string,
  referenceType: string,
  referenceId: string,
  description: string,
  transactionDate: Date,
  db: DbClient,
): Promise<void> {
  const existing = await db.ledgerTransaction.findFirst({
    where: {
      userId,
      referenceType,
      referenceId,
      status: LEDGER_STATUS.POSTED,
    },
  });
  if (!existing) return;
  await ledgerService.reverse(
    userId,
    existing.id,
    description,
    transactionDate,
    db,
  );
}

async function reverseByReferencePrefix(
  userId: string,
  referenceType: string,
  referenceIdPrefix: string,
  description: string,
  transactionDate: Date,
  db: DbClient,
): Promise<void> {
  const rows = await db.ledgerTransaction.findMany({
    where: {
      userId,
      referenceType,
      status: LEDGER_STATUS.POSTED,
      referenceId: { startsWith: referenceIdPrefix },
    },
    orderBy: { createdAt: "desc" },
  });
  for (const row of rows) {
    await ledgerService.reverse(
      userId,
      row.id,
      description,
      transactionDate,
      db,
    );
  }
}

async function repostInvoiceSaleCollections(
  userId: string,
  sale: SaleLedgerRow,
  paid: InvoiceAmountPaid,
  db: DbClient,
): Promise<void> {
  for (let i = 0; i < paid.items.length; i++) {
    const item = paid.items[i]!;
    if (item.amount <= 0) continue;
    await ledgerPostingService.postSaleCollection(
      userId,
      sale.id,
      item.amount,
      item.paymentType,
      sale.saleDate,
      `inv:${i}`,
      item.bankCode ?? sale.settlementBankCode,
      db,
    );
  }
}

async function repostInvoiceExpensePayments(
  userId: string,
  expense: ExpenseLedgerRow,
  paid: InvoiceAmountPaid,
  db: DbClient,
): Promise<void> {
  for (let i = 0; i < paid.items.length; i++) {
    const item = paid.items[i]!;
    if (item.amount <= 0) continue;
    await ledgerPostingService.postExpensePayment(
      userId,
      expense.id,
      item.amount,
      item.paymentType,
      expense.expenseDate,
      `inv:${i}`,
      item.bankCode ?? expense.settlementBankCode,
      db,
    );
  }
}

/** Keep ledger aligned after PATCH when amounts, payment type, or async confirm state changes. */
export async function syncSaleLedgerAfterUpdate(
  userId: string,
  previous: SaleLedgerRow,
  next: SaleLedgerRow,
  db: DbClient = prisma,
): Promise<void> {
  const txnDate = next.saleDate;
  const wasAsyncPaid =
    isAsyncPaymentType(previous.paymentType) &&
    isSalePaidStatus(previous.status);
  const isAsyncPaid =
    isAsyncPaymentType(next.paymentType) && isSalePaidStatus(next.status);

  if (wasAsyncPaid && !isAsyncPaid) {
    await reverseByReference(
      userId,
      LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
      `${previous.id}:confirm`,
      `Reverse sale collection ${previous.id}`,
      txnDate,
      db,
    );
  }

  const prevPaid = coerceInvoiceAmountPaid(previous.invoiceAmountPaid);
  const nextPaid = coerceInvoiceAmountPaid(next.invoiceAmountPaid);
  const invoicePaymentsChanged =
    isInvoicePaymentType(previous.paymentType) ||
    isInvoicePaymentType(next.paymentType)
      ? JSON.stringify(prevPaid) !== JSON.stringify(nextPaid)
      : false;

  if (recognitionChanged(previous, next)) {
    await reverseByReference(
      userId,
      LEDGER_REFERENCE_TYPES.SALE_RECOGNITION,
      previous.id,
      `Reverse sale recognition ${previous.id}`,
      txnDate,
      db,
    );
    await ledgerPostingService.postSaleRecognition(userId, next, db);
  }

  if (invoicePaymentsChanged) {
    await reverseByReferencePrefix(
      userId,
      LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
      `${previous.id}:`,
      `Reverse sale collections ${previous.id}`,
      txnDate,
      db,
    );
    if (isInvoicePaymentType(next.paymentType)) {
      await repostInvoiceSaleCollections(userId, next, nextPaid, db);
    }
  }
}

export async function syncExpenseLedgerAfterUpdate(
  userId: string,
  previous: ExpenseLedgerRow,
  next: ExpenseLedgerRow,
  db: DbClient = prisma,
): Promise<void> {
  const txnDate = next.expenseDate;
  const wasAsyncPaid =
    isAsyncPaymentType(previous.paymentType) &&
    isSalePaidStatus(previous.status);
  const isAsyncPaid =
    isAsyncPaymentType(next.paymentType) && isSalePaidStatus(next.status);

  if (wasAsyncPaid && !isAsyncPaid) {
    await reverseByReference(
      userId,
      LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
      `${previous.id}:confirm`,
      `Reverse expense payment ${previous.id}`,
      txnDate,
      db,
    );
  }

  const prevPaid = coerceInvoiceAmountPaid(previous.invoiceAmountPaid);
  const nextPaid = coerceInvoiceAmountPaid(next.invoiceAmountPaid);
  const invoicePaymentsChanged =
    isInvoicePaymentType(previous.paymentType) ||
    isInvoicePaymentType(next.paymentType)
      ? JSON.stringify(prevPaid) !== JSON.stringify(nextPaid)
      : false;

  if (recognitionChanged(previous, next)) {
    await reverseByReference(
      userId,
      LEDGER_REFERENCE_TYPES.EXPENSE_RECOGNITION,
      previous.id,
      `Reverse expense recognition ${previous.id}`,
      txnDate,
      db,
    );
    await ledgerPostingService.postExpenseRecognition(userId, next, db);
  }

  if (invoicePaymentsChanged) {
    await reverseByReferencePrefix(
      userId,
      LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
      `${previous.id}:`,
      `Reverse expense payments ${previous.id}`,
      txnDate,
      db,
    );
    if (isInvoicePaymentType(next.paymentType)) {
      await repostInvoiceExpensePayments(userId, next, nextPaid, db);
    }
  }
}
