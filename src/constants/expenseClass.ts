export const EXPENSE_CLASSES = [
  "business",
  "personal",
  "uncategorized",
] as const;

export type ExpenseClass = (typeof EXPENSE_CLASSES)[number];

export const DEFAULT_EXPENSE_CLASS: ExpenseClass = "uncategorized";

export function normalizeExpenseClass(
  value: unknown,
): ExpenseClass | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "ambiguous") return "uncategorized";
  if ((EXPENSE_CLASSES as readonly string[]).includes(normalized)) {
    return normalized as ExpenseClass;
  }
  return undefined;
}

export function resolveExpenseClassForStorage(
  value: unknown,
  field = "class",
): ExpenseClass {
  const normalized = normalizeExpenseClass(value);
  if (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== "" &&
    normalized === undefined
  ) {
    throw new Error(
      `${field} must be one of: ${EXPENSE_CLASSES.join(", ")}`,
    );
  }
  return normalized ?? DEFAULT_EXPENSE_CLASS;
}

export function expenseClassForResponse(
  value: string | null | undefined,
): ExpenseClass {
  if (value == null || value === "" || value === "ambiguous") {
    return DEFAULT_EXPENSE_CLASS;
  }
  if ((EXPENSE_CLASSES as readonly string[]).includes(value)) {
    return value as ExpenseClass;
  }
  return DEFAULT_EXPENSE_CLASS;
}

/** @deprecated use resolveExpenseClassForStorage */
export function assertExpenseClass(value: unknown, field = "class"): ExpenseClass | null {
  if (value === undefined) return null;
  return resolveExpenseClassForStorage(value, field);
}
