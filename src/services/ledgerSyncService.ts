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
  amount?: number | { toNumber?: () => number };
  vatAmount?: number | { toNumber?: () => number } | null;
  category?: string | null;
  expenseType?: string | null;
  purchaseKind?: string | null;
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
  if ("amount" in previous && "amount" in next && !("category" in previous)) {
    if (num(previous.amount as number | { toNumber?: () => number }) !==
      num(next.amount as number | { toNumber?: () => number })) {
      return true;
    }
    const salePrev = previous as SaleLedgerRow;
    const saleNext = next as SaleLedgerRow;
    const pv = salePrev.vatAmount != null ? num(salePrev.vatAmount) : 0;
    const nv = saleNext.vatAmount != null ? num(saleNext.vatAmount) : 0;
    if (pv !== nv) return true;
  }
  if ("category" in previous || "category" in next) {
    const prevExp = previous as ExpenseLedgerRow;
    const nextExp = next as ExpenseLedgerRow;
    if ((prevExp.amount != null) !== (nextExp.amount != null)) return true;
    if (prevExp.amount != null && nextExp.amount != null) {
      if (num(prevExp.amount) !== num(nextExp.amount)) return true;
    }
    const pv = prevExp.vatAmount != null ? num(prevExp.vatAmount) : 0;
    const nv = nextExp.vatAmount != null ? num(nextExp.vatAmount) : 0;
    if (pv !== nv) return true;
    if ((prevExp.category ?? "") !== (nextExp.category ?? "")) return true;
    if ((prevExp.expenseType ?? "") !== (nextExp.expenseType ?? "")) return true;
    if ((prevExp.purchaseKind ?? "") !== (nextExp.purchaseKind ?? "")) return true;
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

async function removeByReference(
  userId: string,
  referenceType: string,
  referenceId: string,
  db: DbClient,
): Promise<void> {
  await ledgerService.deletePostedByReference(
    userId,
    referenceType,
    referenceId,
    db,
  );
}

async function removeByReferencePrefix(
  userId: string,
  referenceType: string,
  referenceIdPrefix: string,
  db: DbClient,
): Promise<void> {
  await ledgerService.deletePostedByReferencePrefix(
    userId,
    referenceType,
    referenceIdPrefix,
    db,
  );
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
    await removeByReference(
      userId,
      LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
      `${previous.id}:confirm`,
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
      await removeByReferencePrefix(
        userId,
        LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
        `${previous.id}:`,
        db,
      );
      await removeByReference(
        userId,
        LEDGER_REFERENCE_TYPES.SALE_RECOGNITION,
        previous.id,
        db,
      );
      await ledgerPostingService.postSaleRecognition(userId, next, db, {
        postInvoiceCollections: false,
      });
      if (nextPaid.items.length > 0) {
        await repostInvoiceSaleCollections(userId, next, nextPaid, db);
      }
    } else {
      await removeByReference(
        userId,
        LEDGER_REFERENCE_TYPES.SALE_RECOGNITION,
        previous.id,
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
      await removeByReferencePrefix(
        userId,
        LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
        `${previous.id}:`,
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
    await removeByReference(
      userId,
      LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
      `${previous.id}:confirm`,
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
      await removeByReferencePrefix(
        userId,
        LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
        `${previous.id}:`,
        db,
      );
      await removeByReference(
        userId,
        LEDGER_REFERENCE_TYPES.EXPENSE_RECOGNITION,
        previous.id,
        db,
      );
      await ledgerPostingService.postExpenseRecognition(userId, next, db, {
        postInvoiceCollections: false,
      });
      if (nextPaid.items.length > 0) {
        await repostInvoiceExpensePayments(userId, next, nextPaid, db);
      }
    } else {
      await removeByReference(
        userId,
        LEDGER_REFERENCE_TYPES.EXPENSE_RECOGNITION,
        previous.id,
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
      await removeByReferencePrefix(
        userId,
        LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
        `${previous.id}:`,
        db,
      );
      await repostInvoiceExpensePayments(userId, next, nextPaid, db);
    }
  }
}

/** Remove journals for a deleted sale (postings PDF: delete removes, do not reverse). */
export async function removeSaleLedgerOnDelete(
  userId: string,
  sale: SaleLedgerRow,
  db: DbClient = prisma,
): Promise<void> {
  await removeByReferencePrefix(
    userId,
    LEDGER_REFERENCE_TYPES.SALE_COLLECTION,
    `${sale.id}:`,
    db,
  );
  await removeByReference(
    userId,
    LEDGER_REFERENCE_TYPES.SALE_RECOGNITION,
    sale.id,
    db,
  );
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

/** Reverse loan principal and interest ledger postings for a repayment undo. */
export async function reverseLoanRepaymentLedgerOnUndo(
  userId: string,
  repaymentId: string,
  paymentDate: Date,
  db: DbClient = prisma,
): Promise<void> {
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.LOAN_INTEREST_PAID,
    `${repaymentId}:interest`,
    `Undo loan interest payment ${repaymentId}`,
    paymentDate,
    db,
  );
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.LOAN_PRINCIPAL_PAID,
    repaymentId,
    `Undo loan principal payment ${repaymentId}`,
    paymentDate,
    db,
  );
}

/** Reverse loan received posting when a liability registration is undone. */
export async function reverseLoanReceivedLedgerOnUndo(
  userId: string,
  liabilityId: string,
  transactionDate: Date,
  db: DbClient = prisma,
): Promise<void> {
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.LOAN_RECEIVED,
    liabilityId,
    `Undo loan received ${liabilityId}`,
    transactionDate,
    db,
  );
}

/** Remove journals for a deleted expense (postings PDF: delete removes, do not reverse). */
export async function removeExpenseLedgerOnDelete(
  userId: string,
  expense: ExpenseLedgerRow,
  db: DbClient = prisma,
): Promise<void> {
  await removeByReferencePrefix(
    userId,
    LEDGER_REFERENCE_TYPES.EXPENSE_PAYMENT,
    `${expense.id}:`,
    db,
  );
  await removeByReference(
    userId,
    LEDGER_REFERENCE_TYPES.EXPENSE_RECOGNITION,
    expense.id,
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

/** Reverse asset purchase posting on asset undo, including UOP / posted depreciation. */
export async function reverseAssetPurchaseLedgerOnUndo(
  userId: string,
  assetId: string,
  purchaseDate: Date,
  db: DbClient = prisma,
): Promise<void> {
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.ASSET_PURCHASE,
    assetId,
    `Undo asset purchase ${assetId}`,
    purchaseDate,
    db,
  );
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.DEPRECIATION,
    assetId,
    `Undo asset depreciation ${assetId}`,
    purchaseDate,
    db,
  );
  const records = await db.unitAttributionProductionRecord.findMany({
    where: { unitAttribution: { userId, assetId } },
    select: { id: true },
  });
  for (const record of records) {
    await reverseByReference(
      userId,
      LEDGER_REFERENCE_TYPES.DEPRECIATION,
      record.id,
      `Undo production depreciation ${record.id}`,
      purchaseDate,
      db,
    );
  }
}

export async function reverseCashOpeningLedgerOnUndo(
  userId: string,
  cashId: string,
  date: Date,
  db: DbClient = prisma,
): Promise<void> {
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.CASH_OPENING,
    cashId,
    `Undo cash opening ${cashId}`,
    date,
    db,
  );
}

export async function reverseBankOpeningLedgerOnUndo(
  userId: string,
  bankId: string,
  date: Date,
  db: DbClient = prisma,
): Promise<void> {
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.BANK_OPENING,
    bankId,
    `Undo bank opening ${bankId}`,
    date,
    db,
  );
}

export async function reverseReceivableLedgerOnUndo(
  userId: string,
  receivableId: string,
  date: Date,
  db: DbClient = prisma,
): Promise<void> {
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.RECEIVABLE,
    receivableId,
    `Undo receivable ${receivableId}`,
    date,
    db,
  );
}

export async function reverseAssetSaleLedgerOnUndo(
  userId: string,
  saleId: string,
  date: Date,
  db: DbClient = prisma,
): Promise<void> {
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.ASSET_SALE,
    saleId,
    `Undo asset sale ${saleId}`,
    date,
    db,
  );
}

export async function reverseAssetDisposalLedgerOnUndo(
  userId: string,
  disposalId: string,
  date: Date,
  db: DbClient = prisma,
): Promise<void> {
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.ASSET_DISPOSAL,
    disposalId,
    `Undo asset disposal ${disposalId}`,
    date,
    db,
  );
}

export async function reverseDepreciationLedgerOnUndo(
  userId: string,
  recordId: string,
  date: Date,
  db: DbClient = prisma,
): Promise<void> {
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.DEPRECIATION,
    recordId,
    `Undo depreciation ${recordId}`,
    date,
    db,
  );
}

export async function reverseAllLedgersForReferenceOnUndo(
  userId: string,
  referenceId: string,
  description: string,
  date: Date,
  db: DbClient = prisma,
): Promise<void> {
  const rows = await db.ledgerTransaction.findMany({
    where: {
      userId,
      referenceId,
      status: LEDGER_STATUS.POSTED,
      referenceType: { not: LEDGER_REFERENCE_TYPES.REVERSAL },
    },
  });
  for (const row of rows) {
    await ledgerService.reverse(userId, row.id, description, date, db);
  }
}

/** Reverse payer recognition and invoice collections on transaction undo. */
export async function reversePayerTransactionLedgerOnUndo(
  userId: string,
  transactionId: string,
  date: string,
  db: DbClient = prisma,
): Promise<void> {
  const txnDate = new Date(`${date}T12:00:00.000Z`);
  await reverseByReferencePrefix(
    userId,
    LEDGER_REFERENCE_TYPES.PAYER_COLLECTION,
    `${transactionId}:`,
    `Undo payer collections ${transactionId}`,
    txnDate,
    db,
  );
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.PAYER_RECOGNITION,
    transactionId,
    `Undo payer recognition ${transactionId}`,
    txnDate,
    db,
  );
}

/** Reverse beneficiary invoice/payment/remittance postings on transaction undo. */
export async function reverseBeneficiaryTransactionLedgerOnUndo(
  userId: string,
  transactionId: string,
  date: string,
  options: { remitted?: boolean } = {},
  db: DbClient = prisma,
): Promise<void> {
  const txnDate = new Date(`${date}T12:00:00.000Z`);
  if (options.remitted) {
    await reverseByReference(
      userId,
      LEDGER_REFERENCE_TYPES.WHT_REMITTED,
      transactionId,
      `Undo WHT remittance ${transactionId}`,
      txnDate,
      db,
    );
  }
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.BENEFICIARY_PAYMENT,
    transactionId,
    `Undo beneficiary payment ${transactionId}`,
    txnDate,
    db,
  );
  await reverseByReference(
    userId,
    LEDGER_REFERENCE_TYPES.BENEFICIARY_INVOICE,
    transactionId,
    `Undo beneficiary invoice ${transactionId}`,
    txnDate,
    db,
  );
}
