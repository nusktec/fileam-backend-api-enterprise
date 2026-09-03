/**
 * CIT / small-company classification inputs — profile vs books rules.
 *
 * Fixed assets: registered assets on books when present; otherwise signup profile.
 * Turnover: signup profile until the business is 12+ months old AND has book
 * transactions; then use transaction-based turnover.
 */

export type ClassificationValueSource = "profile" | "books" | "transactions";

/** Whole calendar months elapsed from start through asOf (exclusive of partial month edge). */
export function businessMonthsElapsed(from: Date, to: Date): number {
  if (to.getTime() < from.getTime()) return 0;
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function shouldUseTransactionTurnover(input: {
  businessCreatedAt: Date;
  asOf: Date;
  hasTransactions: boolean;
}): boolean {
  return (
    input.hasTransactions &&
    businessMonthsElapsed(input.businessCreatedAt, input.asOf) >= 12
  );
}

export function resolveClassificationFixedAssets(
  profileFixedAssets: number | null | undefined,
  booksFixedAssets: number | null | undefined,
): { value: number; source: "profile" | "books" } {
  const books = Math.max(0, booksFixedAssets ?? 0);
  const profile = Math.max(0, profileFixedAssets ?? 0);
  if (books > 0) return { value: books, source: "books" };
  return { value: profile, source: "profile" };
}

export function resolveClassificationTurnover(
  profileTurnover: number | null | undefined,
  booksTurnover: number | null | undefined,
  useTransactionTurnover: boolean,
): { value: number; source: ClassificationValueSource } {
  const profile = Math.max(0, profileTurnover ?? 0);
  const books = Math.max(0, booksTurnover ?? 0);
  if (useTransactionTurnover) {
    return { value: books, source: "transactions" };
  }
  return { value: profile, source: "profile" };
}
