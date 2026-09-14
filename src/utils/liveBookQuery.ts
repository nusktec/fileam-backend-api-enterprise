import { SALE_STATUS } from "../constants/salePaymentRules";
import { isUndoneStatus } from "../constants/recordUndo";

/** Prisma where — live sales (excludes voided/reversed). */
export function liveSaleWhere(userId: string, dateRange?: { gte: Date; lte: Date }) {
  return {
    userId,
    ...(dateRange ? { saleDate: dateRange } : {}),
    status: { notIn: [SALE_STATUS.VOIDED, SALE_STATUS.REVERSED] },
  };
}

/** Prisma where — live expenses (excludes voided/reversed). */
export function liveExpenseWhere(
  userId: string,
  dateRange?: { gte: Date; lte: Date },
) {
  return {
    userId,
    ...(dateRange ? { expenseDate: dateRange } : {}),
    status: { notIn: [SALE_STATUS.VOIDED, SALE_STATUS.REVERSED] },
  };
}

/** Skip undone rows in in-memory loops (sales/expenses/payer/beneficiary status). */
export function isLiveBookStatus(status: string | null | undefined): boolean {
  return !isUndoneStatus(status);
}
