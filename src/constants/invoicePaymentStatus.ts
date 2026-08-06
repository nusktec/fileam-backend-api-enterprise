/**
 * Invoice payment status for Invoice paymentType only (Sales and Expenses),
 * derived from invoiceAmountPaid.total + invoiceDueDate.
 *
 * Cash / Transfer / Card keep the manual lifecycle in `salePaymentRules`
 * (Cash → PAID on create, Transfer & Card → IN_PROGRESS → PAID via payment-status).
 */
export const INVOICE_PAYMENT_STATUS = {
  PAID: "PAID",
  PARTIAL: "Partial",
  PENDING: "Pending",
  OVERDUE: "Overdue",
} as const;

export type InvoicePaymentStatus =
  (typeof INVOICE_PAYMENT_STATUS)[keyof typeof INVOICE_PAYMENT_STATUS];

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * @param invoicePaidAmount amount already paid toward the invoice (invoiceAmountPaid.total)
 * @param amount invoice total due (use totalAmount — base + VAT)
 * @param invoiceDueDate optional due date (calendar date)
 */
export function computeInvoicePaymentStatus(input: {
  invoicePaidAmount: number;
  amount: number;
  invoiceDueDate?: Date | string | null;
  asOf?: Date;
}): InvoicePaymentStatus {
  const paid = Number(input.invoicePaidAmount) || 0;
  const due = Number(input.amount) || 0;
  const eps = 0.005;

  if (due <= eps) {
    return INVOICE_PAYMENT_STATUS.PAID;
  }

  if (paid + eps >= due) {
    return INVOICE_PAYMENT_STATUS.PAID;
  }

  const asOf = input.asOf ?? new Date();
  if (input.invoiceDueDate) {
    const raw =
      input.invoiceDueDate instanceof Date
        ? input.invoiceDueDate
        : new Date(String(input.invoiceDueDate));
    if (!Number.isNaN(raw.getTime()) && startOfUtcDay(raw) < startOfUtcDay(asOf)) {
      return INVOICE_PAYMENT_STATUS.OVERDUE;
    }
  }

  if (paid > eps) {
    return INVOICE_PAYMENT_STATUS.PARTIAL;
  }

  return INVOICE_PAYMENT_STATUS.PENDING;
}
