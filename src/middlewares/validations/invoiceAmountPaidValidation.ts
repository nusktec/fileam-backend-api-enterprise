import { body } from "express-validator";
import {
  INVOICE_AMOUNT_PAID_PAYMENT_TYPES,
  parseAndValidateInvoiceAmountPaid,
} from "../../constants/invoiceAmountPaid";
import { HttpReplyError } from "../../utils/httpReplyError";

/**
 * Optional `invoiceAmountPaid: { total, items: [{ amount, paymentType }] }`
 * with total === sum(items[].amount).
 */
export function optionalInvoiceAmountPaidValidation(field = "invoiceAmountPaid") {
  return body(field)
    .optional({ nullable: true })
    .custom((value) => {
      try {
        parseAndValidateInvoiceAmountPaid(value, field);
        return true;
      } catch (e) {
        if (e instanceof HttpReplyError) {
          throw new Error(e.message);
        }
        throw e;
      }
    });
}

/**
 * Optional nested field on bulk items, e.g. `items.*.invoiceAmountPaid`.
 */
export function optionalBulkInvoiceAmountPaidValidation(
  field = "items.*.invoiceAmountPaid",
) {
  return body(field)
    .optional({ nullable: true })
    .custom((value) => {
      try {
        parseAndValidateInvoiceAmountPaid(value, "invoiceAmountPaid");
        return true;
      } catch (e) {
        if (e instanceof HttpReplyError) {
          throw new Error(e.message);
        }
        throw e;
      }
    });
}

export const INVOICE_AMOUNT_PAID_PAYMENT_TYPE_HINT =
  INVOICE_AMOUNT_PAID_PAYMENT_TYPES.join(", ");
