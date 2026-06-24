/** High-level expense classification for P&L and reporting. */
export const EXPENSE_TYPES = ["OPEX", "COGS", "CAPEX", "Tax"] as const;

export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export function isValidExpenseType(value: string): value is ExpenseType {
  return (EXPENSE_TYPES as readonly string[]).includes(value);
}
