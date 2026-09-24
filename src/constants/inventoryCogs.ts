export const INVENTORY_COGS_PERIODS = [
  "today",
  "month",
  "year",
  "all_time",
] as const;

export type InventoryCogsPeriod = (typeof INVENTORY_COGS_PERIODS)[number];

export function parseInventoryCogsPeriod(
  value: unknown,
): InventoryCogsPeriod {
  if (value == null || value === "") return "today";
  const raw = String(value);
  if ((INVENTORY_COGS_PERIODS as readonly string[]).includes(raw)) {
    return raw as InventoryCogsPeriod;
  }
  throw new Error("INVALID_COGS_PERIOD");
}

export type InventoryCogs = {
  openingInventory: number;
  purchases: number;
  directAcquisitionCosts: number;
  closingInventory: number;
  costOfGoodsSold: number;
};

export const EMPTY_INVENTORY_COGS: InventoryCogs = {
  openingInventory: 0,
  purchases: 0,
  directAcquisitionCosts: 0,
  closingInventory: 0,
  costOfGoodsSold: 0,
};
