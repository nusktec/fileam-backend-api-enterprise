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
  assertInvoicePaymentsAppendOnly,
  postIncrementalExpensePayments,
  postIncrementalSaleCollections,
} from "../utils/invoicePaymentLedger";
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
  if (num(previous.totalAmount) !== num(next.totalAmount)) return true;
  if (
    (previous.settlementBankCode ?? null) !== (next.settlementBankCode ?? null)
  ) {
    return true;
  }
  if ("amount" in previous && "amount" in next) {
    if (num(previous.amount) !== num(next.amount)) return true;
    const pv = previous.vatAmount != null ? num(previous.vatAmount) : 0;
    const nv = next.vatAmount != null ? num(next.vatAmount) : 0;
    if (pv !== nv) return true;
  }
  // Invoice status (Pending/Partial/PAID) is derived from payments — not a recognition event.
  const invoiceLifecycle =
    isInvoicePaymentType(previous.paymentType) &&
    isInvoicePaymentType(next.paymentType);
  if (!invoiceLifecycle && previous.status !== next.status) {
    return true;
  }
  return false;
}

function isAppendOnlyInvoicePaymentChange(
  previous: InvoiceAmountPaid,
  next: InvoiceAmountPaid,
): boolean {
  if (next.items.length < previous.items.length) return false;
  try {
    assertInvoicePaymentsAppendOnly(previous, next);
    return true;
  } catch {
    return false;
  }
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
    if (isInvoicePaymentType(next.paymentType)) {
      await reverseByReferencePrefix(
        userId,
        LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
        `${previous.id}:`,
        `Reverse sale collections ${previous.id}`,
        txnDate,
        db,
      );
      await reverseByReference(
        userId,
        LEDGER_REFERENCE_TYPES.SALE_RECOGNITION,
        previous.id,
        `Reverse sale recognition ${previous.id}`,
        txnDate,
        db,
      );
      await ledgerPostingService.postSaleRecognition(userId, next, db, {
        postInvoiceCollections: false,
      });
      if (nextPaid.items.length > 0) {
        await repostInvoiceSaleCollections(userId, next, nextPaid, db);
      }
    } else {
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
  } else if (invoicePaymentsChanged && isInvoicePaymentType(next.paymentType)) {
    if (isAppendOnlyInvoicePaymentChange(prevPaid, nextPaid)) {
      await postIncrementalSaleCollections(
        userId,
        next.id,
        prevPaid,
        nextPaid,
        txnDate,
        next.settlementBankCode,
        db,
      );
    } else {
      await reverseByReferencePrefix(
        userId,
        LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
        `${previous.id}:`,
        `Reverse sale collections ${previous.id}`,
        txnDate,
        db,
      );
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
    if (isInvoicePaymentType(next.paymentType)) {
      await reverseByReferencePrefix(
        userId,
        LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
        `${previous.id}:`,
        `Reverse expense payments ${previous.id}`,
        txnDate,
        db,
      );
      await reverseByReference(
        userId,
        LEDGER_REFERENCE_TYPES.EXPENSE_RECOGNITION,
        previous.id,
        `Reverse expense recognition ${previous.id}`,
        txnDate,
        db,
      );
      await ledgerPostingService.postExpenseRecognition(userId, next, db, {
        postInvoiceCollections: false,
      });
      if (nextPaid.items.length > 0) {
        await repostInvoiceExpensePayments(userId, next, nextPaid, db);
      }
    } else {
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
  } else if (invoicePaymentsChanged && isInvoicePaymentType(next.paymentType)) {
    if (isAppendOnlyInvoicePaymentChange(prevPaid, nextPaid)) {
      await postIncrementalExpensePayments(
        userId,
        next.id,
        prevPaid,
        nextPaid,
        txnDate,
        next.settlementBankCode,
        db,
      );
    } else {
      await reverseByReferencePrefix(
        userId,
        LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
        `${previous.id}:`,
        `Reverse expense payments ${previous.id}`,
        txnDate,
        db,
      );
      await repostInvoiceExpensePayments(userId, next, nextPaid, db);
    }
  }
}

/** Reverse all ledger postings for a deleted sale. */
export async function reverseSaleLedgerOnDelete(
  userId: string,
  sale: SaleLedgerRow,
  db: DbClient = prisma,
): Promise<void> {
  const txnDate = sale.saleDate;
  await reverseByReferencePrefix(
    userId,
    LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
    `${sale.id}:`,
    `Delete sale collections ${sale.id}`,
    txnDate,
    db,
  );
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.SALE_RECOGNITION,
    sale.id,
    `Delete sale recognition ${sale.id}`,
    txnDate,
    db,
  );
}

/** Reverse all ledger postings for a deleted expense. */
export async function reverseExpenseLedgerOnDelete(
  userId: string,
  expense: ExpenseLedgerRow,
  db: DbClient = prisma,
): Promise<void> {
  const txnDate = expense.expenseDate;
  await reverseByReferencePrefix(
    userId,
    LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
    `${expense.id}:`,
    `Delete expense payments ${expense.id}`,
    txnDate,
    db,
  );
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.EXPENSE_RECOGNITION,
    expense.id,
    `Delete expense recognition ${expense.id}`,
    txnDate,
    db,
  );
}
