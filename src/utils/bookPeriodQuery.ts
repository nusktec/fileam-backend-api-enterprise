import { monthDateRangeUtc } from "./dateRangeQuery";

/** Book periods (year/month) whose calendar month overlaps an inclusive date range. */
export function bookPeriodsOverlappingRange(
  dateFrom?: Date,
  dateTo?: Date,
): Array<{ year: number; month: number }> {
  if (!dateFrom && !dateTo) return [];

  const rangeStart = dateFrom ?? new Date(Date.UTC(1970, 0, 1));
  const rangeEnd = dateTo ?? new Date(Date.UTC(2100, 11, 31, 23, 59, 59, 999));

  const periods: Array<{ year: number; month: number }> = [];
  let year = rangeStart.getUTCFullYear();
  let month = rangeStart.getUTCMonth() + 1;
  const endYear = rangeEnd.getUTCFullYear();
  const endMonth = rangeEnd.getUTCMonth() + 1;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const { start, end } = monthDateRangeUtc(year, month);
    if (end.getTime() >= rangeStart.getTime() && start.getTime() <= rangeEnd.getTime()) {
      periods.push({ year, month });
    }
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return periods;
}

/** Distinct calendar years covered by book periods. */
export function calendarYearsFromBookPeriods(
  periods: Array<{ year: number; month: number }>,
): number[] {
  return [...new Set(periods.map((p) => p.year))];
}
