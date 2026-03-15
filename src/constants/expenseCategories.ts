export const EXPENSE_CATEGORIES = [
  "Rent",
  "Tools & Software",
  "Marketing",
  "Internet",
  "Salary",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
