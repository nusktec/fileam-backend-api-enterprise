import { parsePeriodQuery } from "./dateRangeQuery";

export type TaxPeriodRange = "month" | "quarter" | "year";

export const TAX_PERIOD_RANGES: TaxPeriodRange[] = ["month", "quarter", "year"];

export function parseTaxPeriodRange(value: unknown): TaxPeriodRange {
  const raw = String(value ?? "month")
    .trim()
    .toLowerCase();
  if (raw === "quarter" || raw === "year") return raw;
  return "month";
}

export function resolveTaxPeriod(
  periodRaw: unknown,
  now = new Date(),
): { year: number; month: number } {
  const parsed = parsePeriodQuery(periodRaw);
  if (parsed) return parsed;
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Months ending at anchor month, inclusive (chronological order). */
export function monthsInTaxRange(
  year: number,
  month: number,
  range: TaxPeriodRange,
): Array<{ year: number; month: number }> {
  const count = range === "year" ? 12 : range === "quarter" ? 3 : 1;
  const months: Array<{ year: number; month: number }> = [];
  let y = year;
  let m = month;
  for (let i = 0; i < count; i++) {
    months.unshift({ year: y, month: m });
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
  }
  return months;
}

export function taxPeriodLabel(
  year: number,
  month: number,
  range: TaxPeriodRange,
): string {
  if (range === "month") {
    return `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
  }
  if (range === "quarter") {
    return `Q${Math.ceil(month / 3)} ${year}`;
  }
  return `${year}`;
}

export function taxPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
