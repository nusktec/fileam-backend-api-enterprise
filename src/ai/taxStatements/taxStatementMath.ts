import { PIT_BAND_WIDTHS } from "../../constants/pitFiling";

export function naira(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function statementFourthScheduleTax(chargeableIncome: number): number {
  let remaining = Math.max(0, chargeableIncome);
  let tax = 0;
  for (const band of PIT_BAND_WIDTHS) {
    const slice =
      band.width === Number.POSITIVE_INFINITY
        ? remaining
        : Math.min(remaining, band.width);
    tax += naira(slice * band.rate);
    remaining -= slice;
    if (remaining <= 0) break;
  }
  return tax;
}

export function splitByWeights(total: number, weights: number[]): number[] {
  const roundedTotal = naira(total);
  const sumW = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (sumW <= 0) return weights.map(() => 0);
  const parts = weights.map((w) => naira((roundedTotal * Math.max(0, w)) / sumW));
  const diff = roundedTotal - parts.reduce((s, n) => s + n, 0);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i] !== 0 || i === 0) {
      parts[i] += diff;
      break;
    }
  }
  return parts;
}

export function inclusiveDayCount(startYmd: string, endYmd: string): number {
  const start = Date.parse(`${startYmd}T00:00:00.000Z`);
  const end = Date.parse(`${endYmd}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function overlapInclusiveDays(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (end < start) return 0;
  return inclusiveDayCount(start, end);
}

export function monthsHeldInPeriod(opts: {
  periodStart: string;
  periodEnd: string;
  purchaseYmd: string | null;
  exitYmd: string | null;
}): number {
  const { periodStart, periodEnd, purchaseYmd, exitYmd } = opts;
  if (!purchaseYmd) {
    if (exitYmd && exitYmd < periodEnd) {
      const from = periodStart;
      const to = exitYmd < periodEnd ? exitYmd : periodEnd;
      return countHeldMonths(from, to, periodStart, periodEnd);
    }
    return 12;
  }
  if (purchaseYmd > periodEnd) return 0;
  if (exitYmd && exitYmd < periodStart) return 0;
  const from = purchaseYmd > periodStart ? purchaseYmd : periodStart;
  const to = exitYmd && exitYmd < periodEnd ? exitYmd : periodEnd;
  if (from > to) return 0;
  return countHeldMonths(from, to, periodStart, periodEnd);
}

function countHeldMonths(
  heldFrom: string,
  heldTo: string,
  periodStart: string,
  periodEnd: string,
): number {
  const year = Number(periodStart.slice(0, 4));
  let count = 0;
  for (let month = 1; month <= 12; month += 1) {
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = lastDayOfMonthYmd(year, month);
    if (monthEnd < periodStart || monthStart > periodEnd) continue;
    if (heldFrom <= monthEnd && heldTo >= monthStart) count += 1;
  }
  return count;
}

function lastDayOfMonthYmd(year: number, month: number): string {
  const dt = new Date(Date.UTC(year, month, 0));
  return dt.toISOString().slice(0, 10);
}

export function plLine(
  section: string,
  line: string,
  amount: number,
): { section: string; line: string; amount: number } {
  return { section, line, amount: naira(amount) };
}

export function taxLine(
  line: string,
  amount: number,
): { line: string; amount: number } {
  return { line, amount: naira(amount) };
}
