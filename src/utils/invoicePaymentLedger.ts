import type { InvoiceAmountPaid } from "../constants/invoiceAmountPaid";
import { HttpReplyError } from "./httpReplyError";
import { normalizeMoneyAmount } from "./monetaryAmount";
import { ledgerPostingService } from "../services/ledgerPostingService";

const EPS = 0.005;

/** Invoice payment lines are append-only so ledger postings stay idempotent. */
export function assertInvoicePaymentsAppendOnly(
  previous: InvoiceAmountPaid,
  next: InvoiceAmountPaid,
): void {
  for (let i = 0; i < previous.items.length; i++) {
    const oldItem = previous.items[i]!;
    const newItem = next.items[i];
    if (
      !newItem ||
      Math.abs(newItem.amount - oldItem.amount) > EPS ||
      newItem.paymentType !== oldItem.paymentType
    ) {
      throw new HttpReplyError(
        400,
        "invoiceAmountPaid items can only be appended, not changed or removed",
        null,
        "VALIDATION_ERROR",
      );
    }
  }
}

export function assertInvoiceNotOverpaid(
  totalPaid: number,
  invoiceTotal: number,
): void {
  if (totalPaid > normalizeMoneyAmount(invoiceTotal) + EPS) {
    throw new HttpReplyError(
      400,
      "Payment total cannot exceed the invoice amount",
      null,
      "VALIDATION_ERROR",
    );
  }
}

export async function postIncrementalSaleCollections(
  userId: string,
  saleId: string,
  previous: InvoiceAmountPaid,
  next: InvoiceAmountPaid,
  transactionDate: Date,
  defaultBankCode?: string | null,
): Promise<void> {
  assertInvoicePaymentsAppendOnly(previous, next);
  for (let i = previous.items.length; i < next.items.length; i++) {
    const item = next.items[i]!;
    if (item.amount <= 0) continue;
    await ledgerPostingService.postSaleCollection(
      userId,
      saleId,
      item.amount,
      item.paymentType,
      transactionDate,
      `inv:${i}`,
      item.bankCode ?? defaultBankCode,
    );
  }
}

export async function postIncrementalExpensePayments(
  userId: string,
  expenseId: string,
  previous: InvoiceAmountPaid,
  next: InvoiceAmountPaid,
  transactionDate: Date,
  defaultBankCode?: string | null,
): Promise<void> {
  assertInvoicePaymentsAppendOnly(previous, next);
  for (let i = previous.items.length; i < next.items.length; i++) {
    const item = next.items[i]!;
    if (item.amount <= 0) continue;
    await ledgerPostingService.postExpensePayment(
      userId,
      expenseId,
      item.amount,
      item.paymentType,
      transactionDate,
      `inv:${i}`,
      item.bankCode ?? defaultBankCode,
    );
  }
}
