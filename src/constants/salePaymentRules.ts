/** Matches mobile validation `paymentType` value for unpaid sales. */
export const PAYMENT_TYPE_INVOICE = "Invoice";

export function isInvoicePaymentType(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPE_INVOICE;
}

/** Invoice sales start unpaid; other payment types are treated as settled immediately. */
export function initialSaleStatusForPaymentType(paymentType: string): string {
  return isInvoicePaymentType(paymentType) ? "Pending" : "Paid";
}
