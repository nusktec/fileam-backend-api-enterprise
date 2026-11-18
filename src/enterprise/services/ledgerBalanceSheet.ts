import { prisma } from "../../config/database";
import {
  CHART_ACCOUNTS,
  CHART_BY_CODE,
  resolveChartAccountCode,
} from "../../constants/chartOfAccounts";
import { LEDGER_ACCOUNTS, LEDGER_BOOKS_STATUSES } from "../../constants/ledger";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

/**
 * Net debit minus credit per internal ledger account code.
 * Only POSTED and REVERSED journals count (both sides of a reversal are books).
 * `from` is optional; without it the sum covers all history up to `to`.
 * Dates are UTC calendar days (the transactionDate column is a DATE).
 * A null userId returns an empty map (no ledger for the company).
 */
export async function ledgerNetByRawCode(
  userId: string | null,
  range: { from?: Date; to: Date },
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!userId) return map;

  const rows = await prisma.ledgerEntry.groupBy({
    by: ["accountCode"],
    where: {
      transaction: {
        userId,
        status: { in: [...LEDGER_BOOKS_STATUSES] },
        transactionDate: range.from
          ? { gte: range.from, lte: range.to }
          : { lte: range.to },
      },
    },
    _sum: { debit: true, credit: true },
  });

  for (const row of rows) {
    const net =
      Number(row._sum.debit ?? 0) - Number(row._sum.credit ?? 0);
    map.set(row.accountCode, (map.get(row.accountCode) ?? 0) + net);
  }
  return map;
}

/** Maps raw ledger codes to FileAm chart codes. Unmapped codes are kept separately. */
export function chartNetByCode(raw: Map<string, number>): {
  chart: Map<string, number>;
  unmapped: Map<string, number>;
} {
  const chart = new Map<string, number>();
  const unmapped = new Map<string, number>();
  for (const [code, net] of raw) {
    const chartCode = resolveChartAccountCode(code);
    if (chartCode && CHART_BY_CODE.has(chartCode)) {
      chart.set(chartCode, (chart.get(chartCode) ?? 0) + net);
    } else {
      unmapped.set(code, (unmapped.get(code) ?? 0) + net);
    }
  }
  return { chart, unmapped };
}

export type BalanceLine = { code: string; name: string; amount: number };

const FIXED_ASSET_CODE = /^(15|16)\d{2}$/;
const NON_CURRENT_LIABILITY_CODES = new Set(["2210", "2220"]);
const SHARE_CAPITAL_RAW = [
  LEDGER_ACCOUNTS.SHARE_CAPITAL,
  LEDGER_ACCOUNTS.OWNER_CAPITAL,
];
const OWNER_DRAWINGS_RAW = LEDGER_ACCOUNTS.OWNER_DRAWINGS;
const UNMAPPED_EQUITY_EXCLUDED = new Set<string>([
  ...SHARE_CAPITAL_RAW,
  OWNER_DRAWINGS_RAW,
]);

function sumRaw(raw: Map<string, number>, codes: readonly string[]): number {
  return codes.reduce((s, c) => s + (raw.get(c) ?? 0), 0);
}

/**
 * Balance sheet at `asOf` from posted ledger balances.
 * Assets are net debit balances, liabilities are net credit balances.
 * Retained earnings are cumulative income minus expenses up to `asOf`.
 * `balanceCheck.difference` is assets minus liabilities minus equity.
 * It is 0 when every posted journal balances, so a non-zero value means
 * the ledger itself is out of balance.
 */
export async function buildLedgerBalanceSheet(
  userId: string | null,
  asOf: Date,
) {
  const raw = await ledgerNetByRawCode(userId, { to: asOf });
  const { chart, unmapped } = chartNetByCode(raw);

  const assetsNonCurrent: BalanceLine[] = [];
  const assetsCurrent: BalanceLine[] = [];
  const liabilitiesCurrent: BalanceLine[] = [];
  const liabilitiesNonCurrent: BalanceLine[] = [];
  let profitAndLossNet = 0;

  for (const acct of CHART_ACCOUNTS) {
    const net = chart.get(acct.code) ?? 0;
    if (acct.reportClass === "profit_and_loss") {
      profitAndLossNet += net;
      continue;
    }
    if (net === 0) continue;

    if (acct.lineType === "asset" || acct.lineType === "contra_asset") {
      const line = {
        code: acct.code,
        name: acct.name,
        amount: normalizeMoneyAmount(net),
      };
      if (FIXED_ASSET_CODE.test(acct.code)) assetsNonCurrent.push(line);
      else assetsCurrent.push(line);
    } else if (acct.lineType === "liability") {
      const line = {
        code: acct.code,
        name: acct.name,
        amount: normalizeMoneyAmount(-net),
      };
      if (NON_CURRENT_LIABILITY_CODES.has(acct.code)) {
        liabilitiesNonCurrent.push(line);
      } else {
        liabilitiesCurrent.push(line);
      }
    }
  }

  const sumLines = (lines: BalanceLine[]) =>
    normalizeMoneyAmount(lines.reduce((s, l) => s + l.amount, 0));

  const fixedAssets = sumLines(assetsNonCurrent);
  const currentAssets = sumLines(assetsCurrent);
  const totalAssets = normalizeMoneyAmount(fixedAssets + currentAssets);
  const longTermLiabilities = sumLines(liabilitiesNonCurrent);
  const currentLiabilities = sumLines(liabilitiesCurrent);
  const totalLiabilities = normalizeMoneyAmount(
    longTermLiabilities + currentLiabilities,
  );

  const shareCapital = normalizeMoneyAmount(-sumRaw(raw, SHARE_CAPITAL_RAW));
  const ownerDrawings = normalizeMoneyAmount(-sumRaw(raw, [OWNER_DRAWINGS_RAW]));
  const retainedEarnings = normalizeMoneyAmount(-profitAndLossNet);
  let unmappedOther = 0;
  for (const [code, net] of unmapped) {
    if (!UNMAPPED_EQUITY_EXCLUDED.has(code)) unmappedOther += net;
  }
  const otherEquity = normalizeMoneyAmount(-unmappedOther);
  const totalEquity = normalizeMoneyAmount(
    shareCapital + ownerDrawings + retainedEarnings + otherEquity,
  );

  const difference = normalizeMoneyAmount(
    totalAssets - totalLiabilities - totalEquity,
  );

  return {
    assets: {
      currentAssets,
      fixedAssets,
      total: totalAssets,
      nonCurrent: assetsNonCurrent,
      current: assetsCurrent,
      totalAssets,
    },
    liabilities: {
      currentLiabilities,
      longTermLiabilities,
      total: totalLiabilities,
      nonCurrent: liabilitiesNonCurrent,
      current: liabilitiesCurrent,
      totalLiabilities,
    },
    equity: {
      shareCapital,
      ownerDrawings,
      retainedEarnings,
      otherEquity,
      totalEquity,
      netProfit: normalizeMoneyAmount(-profitAndLossNet),
    },
    balanceCheck: {
      difference,
      balanced: Math.abs(difference) < 0.01,
    },
  };
}

/** Sum of chart account nets for the given chart codes (debit positive). */
export function chartSum(chart: Map<string, number>, codes: string[]): number {
  return codes.reduce((s, c) => s + (chart.get(c) ?? 0), 0);
}

const CASH_CHART_CODES = new Set(["1110", "1120"]);
const FINANCING_CHART_CODES = new Set(["2180", "2210", "2220"]);
const FINANCING_RAW_CODES = new Set<string>([
  LEDGER_ACCOUNTS.SHARE_CAPITAL,
  LEDGER_ACCOUNTS.OWNER_CAPITAL,
  LEDGER_ACCOUNTS.OWNER_DRAWINGS,
  LEDGER_ACCOUNTS.OTHER_EQUITY,
]);

export type CashFlowItem = {
  label: string;
  description: string;
  amount: number;
};

function cashFlowBucket(
  rawCode: string,
  chartCode: string | null,
): "operating" | "investing" | "financing" {
  if (FINANCING_RAW_CODES.has(rawCode)) return "financing";
  if (chartCode && FINANCING_CHART_CODES.has(chartCode)) return "financing";
  if (chartCode && FIXED_ASSET_CODE.test(chartCode)) return "investing";
  return "operating";
}

/**
 * Direct cash flow for a period from journals that move cash or bank.
 * Amounts are the cash effect (inflow positive). Transfers between cash and
 * bank net to zero and are omitted. Sections sum to the change in cash only
 * when every cash movement has a non-cash contra line.
 */
export async function ledgerCashFlow(
  userId: string,
  from: Date,
  to: Date,
): Promise<{
  operating: CashFlowItem[];
  investing: CashFlowItem[];
  financing: CashFlowItem[];
}> {
  const txns = await prisma.ledgerTransaction.findMany({
    where: {
      userId,
      status: { in: [...LEDGER_BOOKS_STATUSES] },
      transactionDate: { gte: from, lte: to },
    },
    include: { entries: true },
  });

  const buckets = {
    operating: new Map<string, { name: string; amount: number }>(),
    investing: new Map<string, { name: string; amount: number }>(),
    financing: new Map<string, { name: string; amount: number }>(),
  };

  for (const txn of txns) {
    let cash = 0;
    const contras: Array<{
      key: string;
      name: string;
      bucket: "operating" | "investing" | "financing";
      weight: number;
    }> = [];
    for (const entry of txn.entries) {
      const chartCode = resolveChartAccountCode(entry.accountCode);
      const net = Number(entry.debit) - Number(entry.credit);
      if (chartCode && CASH_CHART_CODES.has(chartCode)) {
        cash += net;
        continue;
      }
      const weight = Math.abs(net);
      if (weight === 0) continue;
      contras.push({
        key: chartCode ?? entry.accountCode,
        name: entry.accountName || chartCode || entry.accountCode,
        bucket: cashFlowBucket(entry.accountCode, chartCode),
        weight,
      });
    }
    if (cash === 0 || contras.length === 0) continue;
    const weightSum = contras.reduce((sum, contra) => sum + contra.weight, 0);
    for (const contra of contras) {
      const share = (cash * contra.weight) / weightSum;
      const row = buckets[contra.bucket].get(contra.key) ?? {
        name: contra.name,
        amount: 0,
      };
      row.amount += share;
      buckets[contra.bucket].set(contra.key, row);
    }
  }

  const toItems = (map: Map<string, { name: string; amount: number }>) =>
    [...map.values()]
      .map((row) => ({
        label: row.name,
        description: "Posted cash movement",
        amount: normalizeMoneyAmount(row.amount),
      }))
      .filter((item) => item.amount !== 0);

  return {
    operating: toItems(buckets.operating),
    investing: toItems(buckets.investing),
    financing: toItems(buckets.financing),
  };
}
