/** Matches mobile validation `paymentType` values. */
export const PAYMENT_TYPE_CASH = "Cash";
export const PAYMENT_TYPE_CARD = "Card";
export const PAYMENT_TYPE_TRANSFER = "Transfer";
export const PAYMENT_TYPE_INVOICE = "Invoice";

/** Sale payment lifecycle (Cash / Card / Transfer). Invoice sales use PENDING → PAID separately. */
export const SALE_STATUS = {
  IN_PROGRESS: "IN_PROGRESS",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  /** Invoice unpaid (existing flow). */
  PENDING: "Pending",
  /** Invoice overdue (existing flow). */
  OVERDUE: "Overdue",
} as const;

export type SaleStatusValue = (typeof SALE_STATUS)[keyof typeof SALE_STATUS];

export function isInvoicePaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_INVOICE;
}

export function isCashPaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_CASH;
}

/** Card or bank transfer — payment confirmation is asynchronous. */
export function isAsyncPaymentType(paymentType: string): boolean {
  return (
    paymentType === PAYMENT_TYPE_CARD || paymentType === PAYMENT_TYPE_TRANSFER
  );
}

/**
 * Initial sale.status on create:
 * - Cash → PAID
 * - Card / Transfer → IN_PROGRESS
 * - Invoice → Pending (existing invoice confirmation flow)
 */
export function initialSaleStatusForPaymentType(paymentType: string): string {
  if (isInvoicePaymentType(paymentType)) return SALE_STATUS.PENDING;
  if (isAsyncPaymentType(paymentType)) return SALE_STATUS.IN_PROGRESS;
  return SALE_STATUS.PAID;
}

/** True if status means money collected (legacy "Paid" included). */
export function isSalePaidStatus(status: string): boolean {
  return status === SALE_STATUS.PAID || status === "Paid";
}

/** Unpaid receivables: invoice Pending/Overdue or Card/Transfer still IN_PROGRESS. */
export function isSaleReceivableStatus(status: string): boolean {
  return (
    status === SALE_STATUS.PENDING ||
    status === SALE_STATUS.OVERDUE ||
    status === SALE_STATUS.IN_PROGRESS
  );
}

export const SALE_RECEIVABLE_STATUSES = [
  SALE_STATUS.PENDING,
  SALE_STATUS.OVERDUE,
  SALE_STATUS.IN_PROGRESS,
] as const;
