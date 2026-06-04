/**
 * Optional query params: dateFrom, dateTo (YYYY-MM-DD or ISO8601).
 * dateTo is inclusive through end of local calendar day.
 */

export type ParsedDateRange = {
  dateFrom?: Date;
  dateTo?: Date;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Parse a single query date string; returns null if empty/invalid. */
export function parseQueryDate(value: unknown): Date | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T00:00:00`)
    : new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Parse optional dateFrom/dateTo from a query object.
 * Returns error message if invalid or if dateFrom > dateTo.
 */
export function parseDateRangeQuery(q: Record<string, unknown>): {
  ok: true;
  range: ParsedDateRange;
} | { ok: false; message: string } {
  const fromRaw = q.dateFrom ?? q.date_from;
  const toRaw = q.dateTo ?? q.date_to;
  if (
    (fromRaw === undefined || fromRaw === null || fromRaw === "") &&
    (toRaw === undefined || toRaw === null || toRaw === "")
  ) {
    return { ok: true, range: {} };
  }

  const dateFrom = parseQueryDate(fromRaw);
  const dateTo = parseQueryDate(toRaw);

  if (fromRaw && String(fromRaw).trim() && !dateFrom) {
    return { ok: false, message: "dateFrom must be a valid date (YYYY-MM-DD or ISO8601)" };
  }
  if (toRaw && String(toRaw).trim() && !dateTo) {
    return { ok: false, message: "dateTo must be a valid date (YYYY-MM-DD or ISO8601)" };
  }

  const range: ParsedDateRange = {};
  if (dateFrom) range.dateFrom = startOfDay(dateFrom);
  if (dateTo) range.dateTo = endOfDay(dateTo);

  if (range.dateFrom && range.dateTo && range.dateFrom.getTime() > range.dateTo.getTime()) {
    return { ok: false, message: "dateFrom must be on or before dateTo" };
  }

  return { ok: true, range };
}

/** Parse `YYYY-MM` or `YYYY-M` period selector (e.g. tax overview month navigation). */
export function parsePeriodQuery(value: unknown): { year: number; month: number } | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const match = s.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

/** Calendar month for a stored `@db.Date` / book date (UTC date parts). */
export function calendarPeriodFromDate(d: Date): { year: number; month: number } {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Normalize API date strings to a calendar date for Prisma `@db.Date` columns. */
export function toCalendarDate(value: string): Date {
  const d = parseQueryDate(value);
  if (!d) throw new Error("Invalid date");
  return d;
}

/** Inclusive UTC calendar month range for `@db.Date` book fields (sales/expenses). */
export function monthDateRangeUtc(
  year: number,
  month: number,
): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}
