export const PURCHASE_ORIGINS = ["local", "import", "unknown"] as const;
export type PurchaseOrigin = (typeof PURCHASE_ORIGINS)[number];

/** `goods` and `inventory_item` are aliases for stock purchases. */
export const PURCHASE_KINDS = [
  "goods",
  "inventory_item",
  "service",
  "fixed_asset",
] as const;
export type PurchaseKind = (typeof PURCHASE_KINDS)[number];

export const VAT_TAGS = ["vatable", "zero_rated", "exempt"] as const;
export type VatTag = (typeof VAT_TAGS)[number];

export const DEFAULT_PURCHASE_ORIGIN: PurchaseOrigin = "unknown";
export const DEFAULT_PURCHASE_KIND: PurchaseKind = "service";

export function isPurchaseOrigin(value: unknown): value is PurchaseOrigin {
  return (
    typeof value === "string" &&
    (PURCHASE_ORIGINS as readonly string[]).includes(value)
  );
}

export function isPurchaseKind(value: unknown): value is PurchaseKind {
  return (
    typeof value === "string" &&
    (PURCHASE_KINDS as readonly string[]).includes(value)
  );
}

export function isVatTag(value: unknown): value is VatTag {
  return typeof value === "string" && (VAT_TAGS as readonly string[]).includes(value);
}

export function parsePurchaseOrigin(value: unknown): PurchaseOrigin | undefined {
  if (value == null || value === "") return undefined;
  if (!isPurchaseOrigin(value)) {
    throw new Error(
      `purchaseOrigin must be one of: ${PURCHASE_ORIGINS.join(", ")}`,
    );
  }
  return value;
}

export function parsePurchaseKind(value: unknown): PurchaseKind | undefined {
  if (value == null || value === "") return undefined;
  if (!isPurchaseKind(value)) {
    throw new Error(
      `purchaseKind must be one of: ${PURCHASE_KINDS.join(", ")}`,
    );
  }
  return value;
}

export function parseVatTag(value: unknown): VatTag | undefined {
  if (value == null || value === "") return undefined;
  if (!isVatTag(value)) {
    throw new Error(`vatTag must be one of: ${VAT_TAGS.join(", ")}`);
  }
  return value;
}

export function inferVatTag(opts: {
  vatTag?: string | null;
  vatInclusive?: boolean | null;
  vatableIncome?: boolean | null;
  vatAmount?: { toNumber?: () => number } | number | string | null;
}): VatTag {
  if (isVatTag(opts.vatTag)) return opts.vatTag;
  const vatAmount =
    opts.vatAmount == null
      ? 0
      : typeof opts.vatAmount === "number"
        ? opts.vatAmount
        : typeof opts.vatAmount === "string"
          ? Number(opts.vatAmount)
          : Number(opts.vatAmount.toNumber?.() ?? opts.vatAmount);
  if (opts.vatInclusive || opts.vatableIncome || vatAmount > 0) {
    return "vatable";
  }
  return "exempt";
}

export function formatMoneyString(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return n.toFixed(2);
}
