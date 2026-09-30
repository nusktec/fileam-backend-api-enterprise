import { HttpReplyError } from "../../utils/httpReplyError";
import type { TaxStatementPeriod } from "./taxStatementTypes";

export function parseStatementYear(raw: unknown): number {
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new HttpReplyError(400, "year must be a valid YYYY integer");
  }
  return year;
}

export function statementPeriod(year: number): TaxStatementPeriod {
  return {
    year,
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
  };
}

export function ymdFromDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const parsed = new Date(s);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

export function inPeriod(
  ymd: string | null | undefined,
  period: TaxStatementPeriod,
): boolean {
  if (!ymd) return false;
  return ymd >= period.periodStart && ymd <= period.periodEnd;
}
