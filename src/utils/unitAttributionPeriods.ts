import {
  type UnitAttributionPeriodType,
  PRODUCTION_RECORD_STATUS,
} from "../constants/unitAttribution";
import { HttpReplyError } from "./httpReplyError";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

function parseUtcDateOnly(value: Date | string): Date {
  if (value instanceof Date) {
    return utcDate(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    );
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new HttpReplyError(400, "Invalid date format; use YYYY-MM-DD");
  return utcDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function lastDayOfMonth(year: number, month: number): Date {
  return utcDate(year, month + 1, 0);
}

function lastDayOfQuarter(year: number, quarterStartMonth: number): Date {
  return lastDayOfMonth(year, quarterStartMonth + 2);
}

export function validatePeriodStart(
  periodType: UnitAttributionPeriodType,
  periodStart: Date,
): void {
  const day = periodStart.getUTCDay();
  const date = periodStart.getUTCDate();
  const month = periodStart.getUTCMonth();

  switch (periodType) {
    case "DAILY":
      return;
    case "WEEKLY":
      if (day !== 1) {
        throw new HttpReplyError(
          400,
          "periodStart must be a Monday for WEEKLY periods",
        );
      }
      return;
    case "BIWEEKLY": {
      if (day !== 1) {
        throw new HttpReplyError(
          400,
          "periodStart must be a Monday for BIWEEKLY periods",
        );
      }
      const epochMonday = utcDate(1970, 0, 5);
      const diffDays = Math.floor(
        (periodStart.getTime() - epochMonday.getTime()) / MS_PER_DAY,
      );
      if (diffDays % 14 !== 0) {
        throw new HttpReplyError(
          400,
          "periodStart must align to a biweekly interval",
        );
      }
      return;
    }
    case "MONTHLY":
      if (date !== 1) {
        throw new HttpReplyError(
          400,
          "periodStart must be the first day of the month for MONTHLY periods",
        );
      }
      return;
    case "QUARTERLY":
      if (date !== 1 || month % 3 !== 0) {
        throw new HttpReplyError(
          400,
          "periodStart must be the first day of a quarter for QUARTERLY periods",
        );
      }
      return;
    case "YEARLY":
      if (date !== 1 || month !== 0) {
        throw new HttpReplyError(
          400,
          "periodStart must be January 1 for YEARLY periods",
        );
      }
      return;
    default:
      throw new HttpReplyError(400, "Invalid periodType");
  }
}

export function derivePeriodEnd(
  periodType: UnitAttributionPeriodType,
  periodStart: Date,
): Date {
  const year = periodStart.getUTCFullYear();
  const month = periodStart.getUTCMonth();

  switch (periodType) {
    case "DAILY":
      return periodStart;
    case "WEEKLY":
      return addDays(periodStart, 6);
    case "BIWEEKLY":
      return addDays(periodStart, 13);
    case "MONTHLY":
      return lastDayOfMonth(year, month);
    case "QUARTERLY":
      return lastDayOfQuarter(year, month);
    case "YEARLY":
      return utcDate(year, 11, 31);
    default:
      throw new HttpReplyError(400, "Invalid periodType");
  }
}

export function buildPeriodLabel(
  periodType: UnitAttributionPeriodType,
  periodStart: Date,
  periodEnd: Date,
): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  };
  const startLabel = periodStart.toLocaleDateString("en-US", opts);
  const endLabel = periodEnd.toLocaleDateString("en-US", opts);

  switch (periodType) {
    case "DAILY":
      return startLabel;
    case "WEEKLY":
      return `Week of ${startLabel}`;
    case "BIWEEKLY":
      return `${startLabel} – ${endLabel}`;
    case "MONTHLY":
      return periodStart.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    case "QUARTERLY": {
      const q = Math.floor(periodStart.getUTCMonth() / 3) + 1;
      return `Q${q} ${periodStart.getUTCFullYear()}`;
    }
    case "YEARLY":
      return String(periodStart.getUTCFullYear());
    default:
      return `${startLabel} – ${endLabel}`;
  }
}

function alignPeriodStart(
  periodType: UnitAttributionPeriodType,
  date: Date,
): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();

  switch (periodType) {
    case "DAILY":
      return utcDate(y, m, d);
    case "WEEKLY": {
      const day = date.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      return addDays(utcDate(y, m, d), diff);
    }
    case "BIWEEKLY": {
      const monday = alignPeriodStart("WEEKLY", date);
      const epochMonday = utcDate(1970, 0, 5);
      const diffDays = Math.floor(
        (monday.getTime() - epochMonday.getTime()) / MS_PER_DAY,
      );
      const offset = diffDays % 14;
      return addDays(monday, -offset);
    }
    case "MONTHLY":
      return utcDate(y, m, 1);
    case "QUARTERLY":
      return utcDate(y, Math.floor(m / 3) * 3, 1);
    case "YEARLY":
      return utcDate(y, 0, 1);
    default:
      return utcDate(y, m, d);
  }
}

function nextPeriodStart(
  periodType: UnitAttributionPeriodType,
  currentStart: Date,
): Date {
  switch (periodType) {
    case "DAILY":
      return addDays(currentStart, 1);
    case "WEEKLY":
      return addDays(currentStart, 7);
    case "BIWEEKLY":
      return addDays(currentStart, 14);
    case "MONTHLY":
      return utcDate(
        currentStart.getUTCFullYear(),
        currentStart.getUTCMonth() + 1,
        1,
      );
    case "QUARTERLY":
      return utcDate(
        currentStart.getUTCFullYear(),
        currentStart.getUTCMonth() + 3,
        1,
      );
    case "YEARLY":
      return utcDate(currentStart.getUTCFullYear() + 1, 0, 1);
    default:
      return addDays(currentStart, 1);
  }
}

export type SchedulePeriod = {
  id: string | null;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  units: number;
  status: typeof PRODUCTION_RECORD_STATUS.RECORDED | typeof PRODUCTION_RECORD_STATUS.OPEN;
  depreciationAmount: number | null;
  rate: number | null;
};

export function generateOpenPeriodsFrom(
  periodType: UnitAttributionPeriodType,
  firstPeriodStart: Date,
  count: number,
  depreciationPerUnit: number | null,
): SchedulePeriod[] {
  let start = alignPeriodStart(periodType, firstPeriodStart);
  const open: SchedulePeriod[] = [];
  for (let i = 0; i < count; i += 1) {
    const end = derivePeriodEnd(periodType, start);
    open.push({
      id: null,
      periodLabel: buildPeriodLabel(periodType, start, end),
      periodStart: formatYmd(start),
      periodEnd: formatYmd(end),
      units: 0,
      status: PRODUCTION_RECORD_STATUS.OPEN,
      depreciationAmount: null,
      rate: depreciationPerUnit,
    });
    start = nextPeriodStart(periodType, start);
  }
  return open;
}

/** First OPEN period when no production has been recorded yet. */
export function resolveInitialOpenPeriodStart(
  periodType: UnitAttributionPeriodType,
  attributionCreatedAt: Date,
  now: Date = new Date(),
): Date {
  const anchorMs = Math.max(attributionCreatedAt.getTime(), now.getTime());
  return alignPeriodStart(periodType, new Date(anchorMs));
}

export function generateOpenPeriodsAfter(
  periodType: UnitAttributionPeriodType,
  afterDate: Date,
  count: number,
  depreciationPerUnit: number | null,
): SchedulePeriod[] {
  return generateOpenPeriodsFrom(
    periodType,
    addDays(afterDate, 1),
    count,
    depreciationPerUnit,
  );
}

/** @deprecated Use generateOpenPeriodsFrom or generateOpenPeriodsAfter */
export function generateOpenPeriods(
  periodType: UnitAttributionPeriodType,
  afterDate: Date,
  count: number,
  depreciationPerUnit: number | null,
): SchedulePeriod[] {
  return generateOpenPeriodsAfter(
    periodType,
    afterDate,
    count,
    depreciationPerUnit,
  );
}

export function parsePeriodStartInput(value: string): Date {
  return parseUtcDateOnly(value);
}

export { formatYmd as formatPeriodYmd };
