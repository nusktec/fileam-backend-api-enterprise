import { HttpReplyError } from "./httpReplyError";
import { LAGOS_TIME_ZONE } from "./lagosCalendar";

export type LedgerPeriodType = "month" | "year";

export type LedgerPeriod = {
  type: LedgerPeriodType;
  year: number;
  month: number | null;
  startDate: string;
  endDate: string;
  start: Date;
  end: Date;
};

function lagosYmd(date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LAGOS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parse ledger period query (Africa/Lagos calendar). */
export function parseLedgerPeriodQuery(query: {
  period?: unknown;
  year?: unknown;
  month?: unknown;
}): LedgerPeriod {
  const type = String(query.period ?? "").trim().toLowerCase();
  if (type !== "month" && type !== "year") {
    throw new HttpReplyError(
      400,
      "Missing or invalid query (period, year, month), or a future period",
    );
  }

  const year = Number(query.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new HttpReplyError(
      400,
      "Missing or invalid query (period, year, month), or a future period",
    );
  }

  let month: number | null = null;
  if (type === "month") {
    month = Number(query.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new HttpReplyError(
        400,
        "Missing or invalid query (period, year, month), or a future period",
      );
    }
  }

  const today = lagosYmd();
  const start = utcDate(year, type === "month" ? month! : 1, 1);
  const periodEndDay =
    type === "month" ? lastDayOfMonth(year, month!) : lastDayOfMonth(year, 12);
  let end = utcDate(year, type === "month" ? month! : 12, periodEndDay);

  const todayUtc = utcDate(today.year, today.month, today.day);
  if (start.getTime() > todayUtc.getTime()) {
    throw new HttpReplyError(
      400,
      "Missing or invalid query (period, year, month), or a future period",
    );
  }

  const isCurrentMonth =
    type === "month" && year === today.year && month === today.month;
  const isCurrentYear = type === "year" && year === today.year;
  if (isCurrentMonth || isCurrentYear) {
    end = todayUtc;
  }

  return {
    type,
    year,
    month,
    startDate: formatYmd(start),
    endDate: formatYmd(end),
    start,
    end,
  };
}

/** Dashboard P&L window: 1 Jan current Lagos year through today. */
export function dashboardPlPeriod(): { start: Date; end: Date; asAt: string } {
  const today = lagosYmd();
  const start = utcDate(today.year, 1, 1);
  const end = utcDate(today.year, today.month, today.day);
  return { start, end, asAt: formatYmd(end) };
}
