/** Africa/Lagos calendar helpers for payroll and income-history period keys (YYYY-MM). */

export const LAGOS_TIME_ZONE = "Africa/Lagos";

const MONTH_KEY_REGEX = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY_REGEX.test(value);
}

/** Current calendar month in Africa/Lagos as YYYY-MM. */
export function currentMonthKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LAGOS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  if (!year || !month) {
    throw new Error("Failed to resolve Lagos calendar month");
  }
  return `${year}-${month}`;
}

/** YYYY-MM from a Date using Africa/Lagos local calendar date. */
export function monthKeyFromDate(date: Date): string {
  return currentMonthKey(date);
}

export function compareMonthKeys(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function nextMonthKey(key: string): string {
  if (!isMonthKey(key)) {
    throw new Error(`Invalid month key: ${key}`);
  }
  const [y, m] = key.split("-").map(Number);
  if (m === 12) return `${y! + 1}-01`;
  return `${y}-${String(m! + 1).padStart(2, "0")}`;
}

export function monthKeysFromTo(startKey: string, endKey: string): string[] {
  if (!isMonthKey(startKey) || !isMonthKey(endKey)) return [];
  if (compareMonthKeys(startKey, endKey) > 0) return [];
  const keys: string[] = [];
  let cursor = startKey;
  while (compareMonthKeys(cursor, endKey) <= 0) {
    keys.push(cursor);
    cursor = nextMonthKey(cursor);
  }
  return keys;
}
