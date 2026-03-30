import { VAT_FILING_DAY } from "../constants/taxPayable";

/** Default filing due: 21st of the month following the tax period. */
export function defaultFilingDueDateAfterPeriod(
  periodYear: number,
  periodMonth: number,
): Date {
  const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
  const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
  return new Date(nextYear, nextMonth - 1, VAT_FILING_DAY);
}

export function parseFilingPeriodFromQuery(query: Record<string, unknown>): {
  year: number;
  month: number;
} | null {
  const period = query.period as string | undefined;
  if (period && typeof period === "string") {
    const match = period.match(/^(\d{4})-(\d{1,2})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (month >= 1 && month <= 12) return { year, month };
    }
  }
  if (query.year != null && query.month != null) {
    const year = Number(query.year);
    const month = Number(query.month);
    if (year > 0 && month >= 1 && month <= 12) return { year, month };
  }
  return null;
}
