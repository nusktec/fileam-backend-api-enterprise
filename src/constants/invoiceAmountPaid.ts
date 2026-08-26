import { HttpReplyError } from "../utils/httpReplyError";
import { normalizeMoneyAmount } from "../utils/monetaryAmount";

/** Payment methods allowed on invoice payment history lines. */
export const INVOICE_AMOUNT_PAID_PAYMENT_TYPES = [
  "Cash",
  "Transfer",
  "Card",
] as const;

export type InvoiceAmountPaidPaymentType =
  (typeof INVOICE_AMOUNT_PAID_PAYMENT_TYPES)[number];

export type InvoiceAmountPaidItem = {
  amount: number;
  paymentType: InvoiceAmountPaidPaymentType;
};

/**
 * Structured invoice payments:
 *   { total, items: [{ amount, paymentType }] }
 * Invariant: total === sum(items[].amount)
 */
export type InvoiceAmountPaid = {
  total: number;
  items: InvoiceAmountPaidItem[];
};

export const EMPTY_INVOICE_AMOUNT_PAID: InvoiceAmountPaid = {
  total: 0,
  items: [],
};

const EPS = 0.005;

function isPaidPaymentType(value: unknown): value is InvoiceAmountPaidPaymentType {
  return (
    typeof value === "string" &&
    (INVOICE_AMOUNT_PAID_PAYMENT_TYPES as readonly string[]).includes(value)
  );
}

/** Sum of item amounts, money-normalized. */
export function sumInvoiceAmountPaidItems(
  items: Array<{ amount: number }>,
): number {
  return normalizeMoneyAmount(
    items.reduce((s, i) => s + (Number(i.amount) || 0), 0),
  );
}

/**
 * Build a consistent structure from payment lines (total derived from items).
 */
export function buildInvoiceAmountPaid(
  items: InvoiceAmountPaidItem[],
): InvoiceAmountPaid {
  const normalizedItems = items.map((i) => ({
    amount: normalizeMoneyAmount(Number(i.amount) || 0),
    paymentType: i.paymentType,
  }));
  return {
    total: sumInvoiceAmountPaidItems(normalizedItems),
    items: normalizedItems,
  };
}

/** Single collected payment covering `amount` via `paymentType`. */
export function invoiceAmountPaidFromSingle(
  amount: number,
  paymentType: string,
): InvoiceAmountPaid {
  const amt = normalizeMoneyAmount(Number(amount) || 0);
  if (amt <= 0) return { ...EMPTY_INVOICE_AMOUNT_PAID, items: [] };
  const type = isPaidPaymentType(paymentType) ? paymentType : "Transfer";
  return buildInvoiceAmountPaid([{ amount: amt, paymentType: type }]);
}

/**
 * Initial paid structure on create:
 * - Cash / Transfer (or fullyPaid, e.g. bulk) → one line for the full total
 * - otherwise empty
 */
export function initialInvoiceAmountPaid(
  paymentType: string,
  totalAmount: number,
  opts?: { fullyPaid?: boolean },
): InvoiceAmountPaid {
  if (
    opts?.fullyPaid ||
    paymentType === "Cash" ||
    paymentType === "Transfer"
  ) {
    return invoiceAmountPaidFromSingle(totalAmount, paymentType);
  }
  return { total: 0, items: [] };
}

/**
 * Validate + normalize a client payload.
 * Requires total === sum(items[].amount).
 */
export function parseAndValidateInvoiceAmountPaid(
  input: unknown,
  label = "invoiceAmountPaid",
): InvoiceAmountPaid {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpReplyError(400, `${label} must be an object with total and items`);
  }
  const raw = input as { total?: unknown; items?: unknown };
  if (!Array.isArray(raw.items)) {
    throw new HttpReplyError(400, `${label}.items must be an array`);
  }

  const items: InvoiceAmountPaidItem[] = [];
  for (let i = 0; i < raw.items.length; i++) {
    const row = raw.items[i];
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      throw new HttpReplyError(400, `${label}.items[${i}] must be an object`);
    }
    const amount = Number((row as { amount?: unknown }).amount);
    const paymentType = (row as { paymentType?: unknown }).paymentType;
    if (!Number.isFinite(amount) || amount < 0) {
      throw new HttpReplyError(
        400,
        `${label}.items[${i}].amount must be a non-negative number`,
      );
    }
    if (!isPaidPaymentType(paymentType)) {
      throw new HttpReplyError(
        400,
        `${label}.items[${i}].paymentType must be one of: ${INVOICE_AMOUNT_PAID_PAYMENT_TYPES.join(", ")}`,
      );
    }
    items.push({
      amount: normalizeMoneyAmount(amount),
      paymentType,
    });
  }

  const itemsSum = sumInvoiceAmountPaidItems(items);
  const total =
    raw.total === undefined || raw.total === null
      ? itemsSum
      : normalizeMoneyAmount(Number(raw.total));

  if (!Number.isFinite(total) || total < 0) {
    throw new HttpReplyError(400, `${label}.total must be a non-negative number`);
  }
  if (Math.abs(total - itemsSum) > EPS) {
    throw new HttpReplyError(
      400,
      `${label}.total must equal the sum of items[].amount`,
    );
  }

  return { total: itemsSum, items };
}

/** Read stored Json (or legacy number) into the structured shape. */
export function coerceInvoiceAmountPaid(value: unknown): InvoiceAmountPaid {
  if (value == null) return { total: 0, items: [] };

  if (typeof value === "number" || typeof value === "string") {
    const n = normalizeMoneyAmount(Number(value) || 0);
    if (n <= 0) return { total: 0, items: [] };
    return invoiceAmountPaidFromSingle(n, "Transfer");
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    try {
      return parseAndValidateInvoiceAmountPaid(value);
    } catch {
      const raw = value as { total?: unknown; items?: unknown };
      const items = Array.isArray(raw.items)
        ? (raw.items as Array<{ amount?: unknown; paymentType?: unknown }>)
            .map((i) => ({
              amount: normalizeMoneyAmount(Number(i?.amount) || 0),
              paymentType: isPaidPaymentType(i?.paymentType)
                ? i.paymentType
                : ("Transfer" as InvoiceAmountPaidPaymentType),
            }))
            .filter((i) => i.amount > 0)
        : [];
      if (items.length > 0) return buildInvoiceAmountPaid(items);
      const total = normalizeMoneyAmount(Number(raw.total) || 0);
      if (total > 0) return invoiceAmountPaidFromSingle(total, "Transfer");
      return { total: 0, items: [] };
    }
  }

  return { total: 0, items: [] };
}

/** Prisma Json-safe plain object. */
export function invoiceAmountPaidToJson(
  paid: InvoiceAmountPaid,
): { total: number; items: InvoiceAmountPaidItem[] } {
  return {
    total: paid.total,
    items: paid.items.map((i) => ({
      amount: i.amount,
      paymentType: i.paymentType,
    })),
  };
}
