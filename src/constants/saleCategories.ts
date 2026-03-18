export const SALE_CATEGORIES = [
  "Consulting",
  "Product Sales",
  "Service Income",
  "Subscription",
  "Other",
] as const;

export type SaleCategory = (typeof SALE_CATEGORIES)[number];
