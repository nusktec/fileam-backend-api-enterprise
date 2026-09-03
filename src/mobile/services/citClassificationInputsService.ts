import { prisma } from "../../config/database";
import { ASSET_ON_BOOKS_STATUSES } from "../../constants/assets";
import { businessProfileMoneyToNumber } from "../../constants/businessProfile";
import {
  businessMonthsElapsed,
  resolveClassificationFixedAssets,
  resolveClassificationTurnover,
  shouldUseTransactionTurnover,
  type ClassificationValueSource,
} from "../../constants/citClassificationInputs";
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";

function decimalToNumber(
  d: { toNumber?: () => number } | number | null | undefined,
): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  if (typeof d.toNumber === "function") return d.toNumber();
  return Number(d);
}

export async function getBooksFixedAssetsTotal(
  userId: string,
): Promise<number | null> {
  const rows = await prisma.asset.findMany({
    where: { userId, status: { in: [...ASSET_ON_BOOKS_STATUSES] } },
    select: { purchaseCost: true },
  });
  const total = rows.reduce((s, r) => s + decimalToNumber(r.purchaseCost), 0);
  return total > 0 ? total : null;
}

/** Sum of sales in the trailing 12 calendar months ending at asOf. */
export async function getTrailingTwelveMonthTurnover(
  userId: string,
  asOf = new Date(),
): Promise<number | null> {
  const end = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  const start = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 11, 1, 0, 0, 0, 0),
  );
  const agg = await prisma.sale.aggregate({
    where: { userId, saleDate: { gte: start, lte: end } },
    _sum: { totalAmount: true },
  });
  const total = decimalToNumber(agg._sum.totalAmount);
  return total > 0 ? total : null;
}

export async function sumAnnualSalesTurnover(
  userId: string,
  year: number,
): Promise<number> {
  let turnover = 0;
  for (let month = 1; month <= 12; month++) {
    const { start, end } = monthDateRangeUtc(year, month);
    const agg = await prisma.sale.aggregate({
      where: { userId, saleDate: { gte: start, lte: end } },
      _sum: { totalAmount: true },
    });
    turnover += decimalToNumber(agg._sum.totalAmount);
  }
  return turnover;
}

export async function hasBookTransactions(
  userId: string,
  opts?: { year?: number },
): Promise<boolean> {
  if (opts?.year != null) {
    const { start } = monthDateRangeUtc(opts.year, 1);
    const { end } = monthDateRangeUtc(opts.year, 12);
    const [sales, expenses] = await Promise.all([
      prisma.sale.count({ where: { userId, saleDate: { gte: start, lte: end } } }),
      prisma.expense.count({
        where: { userId, expenseDate: { gte: start, lte: end } },
      }),
    ]);
    return sales > 0 || expenses > 0;
  }

  const [sales, expenses] = await Promise.all([
    prisma.sale.count({ where: { userId }, take: 1 }),
    prisma.expense.count({ where: { userId }, take: 1 }),
  ]);
  return sales > 0 || expenses > 0;
}

export type ResolvedCitClassificationInputs = {
  turnover: number;
  fixedAssets: number;
  turnoverSource: ClassificationValueSource;
  fixedAssetsSource: "profile" | "books";
  businessMonthsElapsed: number;
  usesTransactionTurnover: boolean;
  hasTransactions: boolean;
};

export async function resolveCitClassificationInputsForUser(
  userId: string,
  asOf = new Date(),
): Promise<ResolvedCitClassificationInputs | null> {
  const business = await prisma.business.findFirst({ where: { userId } });
  if (!business) return null;

  const [booksFixedAssets, booksTurnover, hasTransactions] = await Promise.all([
    getBooksFixedAssetsTotal(userId),
    getTrailingTwelveMonthTurnover(userId, asOf),
    hasBookTransactions(userId),
  ]);

  const profileTurnover = businessProfileMoneyToNumber(
    business.annualGrossTurnover,
  );
  const profileFixedAssets = businessProfileMoneyToNumber(
    business.totalFixedAssets,
  );

  const monthsElapsed = businessMonthsElapsed(business.createdAt, asOf);
  const useTransactionTurnover = shouldUseTransactionTurnover({
    businessCreatedAt: business.createdAt,
    asOf,
    hasTransactions,
  });

  const turnoverResolved = resolveClassificationTurnover(
    profileTurnover,
    booksTurnover,
    useTransactionTurnover,
  );
  const assetsResolved = resolveClassificationFixedAssets(
    profileFixedAssets,
    booksFixedAssets,
  );

  return {
    turnover: turnoverResolved.value,
    fixedAssets: assetsResolved.value,
    turnoverSource: turnoverResolved.source,
    fixedAssetsSource: assetsResolved.source,
    businessMonthsElapsed: monthsElapsed,
    usesTransactionTurnover: useTransactionTurnover,
    hasTransactions,
  };
}

export async function resolveCitClassificationInputsForYear(
  userId: string,
  year: number,
): Promise<ResolvedCitClassificationInputs | null> {
  const business = await prisma.business.findFirst({ where: { userId } });
  if (!business) return null;

  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const [booksFixedAssets, annualTurnover, hasTransactions] = await Promise.all([
    getBooksFixedAssetsTotal(userId),
    sumAnnualSalesTurnover(userId, year),
    hasBookTransactions(userId),
  ]);

  const profileTurnover = businessProfileMoneyToNumber(
    business.annualGrossTurnover,
  );
  const profileFixedAssets = businessProfileMoneyToNumber(
    business.totalFixedAssets,
  );

  const monthsElapsed = businessMonthsElapsed(business.createdAt, yearEnd);
  const useTransactionTurnover = shouldUseTransactionTurnover({
    businessCreatedAt: business.createdAt,
    asOf: yearEnd,
    hasTransactions,
  });

  const turnoverResolved = resolveClassificationTurnover(
    profileTurnover,
    annualTurnover,
    useTransactionTurnover,
  );
  const assetsResolved = resolveClassificationFixedAssets(
    profileFixedAssets,
    booksFixedAssets,
  );

  return {
    turnover: turnoverResolved.value,
    fixedAssets: assetsResolved.value,
    turnoverSource: turnoverResolved.source,
    fixedAssetsSource: assetsResolved.source,
    businessMonthsElapsed: monthsElapsed,
    usesTransactionTurnover: useTransactionTurnover,
    hasTransactions,
  };
}
