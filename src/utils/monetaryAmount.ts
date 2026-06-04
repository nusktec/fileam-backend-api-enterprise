import { HttpReplyError } from "./httpReplyError";

/** Matches Prisma `@db.Decimal(14, 2)` — up to 12 integer digits and 2 decimal places. */
export const MAX_MONETARY_AMOUNT = 999_999_999_999.99;

export function formatMonetaryLimit(): string {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(MAX_MONETARY_AMOUNT);
}

export function monetaryAmountLimitMessage(fieldLabel = "Amount"): string {
  return `${fieldLabel} cannot exceed ${formatMonetaryLimit()}. Please enter a smaller value.`;
}

export function validateMonetaryAmount(
  value: unknown,
  fieldLabel = "Amount",
): string | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return `${fieldLabel} must be a valid number.`;
  if (n < 0) return `${fieldLabel} must be zero or greater.`;
  if (n > MAX_MONETARY_AMOUNT) return monetaryAmountLimitMessage(fieldLabel);
  return null;
}

export function assertMonetaryAmountInRange(
  value: unknown,
  fieldLabel = "Amount",
): void {
  const msg = validateMonetaryAmount(value, fieldLabel);
  if (msg) throw new HttpReplyError(400, msg);
}
