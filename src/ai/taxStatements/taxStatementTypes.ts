export const TAX_STATEMENT_INCOME_TYPES = [
  "PAYEE",
  "REMOTE_WORKER",
  "GIG_WORKER",
  "TRADER",
  "SOLOPRENEUR",
] as const;

export type TaxStatementIncomeType =
  (typeof TAX_STATEMENT_INCOME_TYPES)[number];

export type TaxStatementLine = {
  section: string;
  line: string;
  amount: number;
};

export type TaxComputationLine = {
  line: string;
  amount: number;
};

export type TaxStatementPeriod = {
  year: number;
  periodStart: string;
  periodEnd: string;
};

export type TaxStatementResult = {
  incomeType: TaxStatementIncomeType;
  year: number;
  periodStart: string;
  periodEnd: string;
  currency: "NGN";
  legalStructure?: string | null;
  liabilityTax?: "PIT" | "CIT";
  incomeStatement?: TaxStatementLine[];
  profitAndLoss?: TaxStatementLine[];
  taxComputation: TaxComputationLine[];
};

export function isTaxStatementIncomeType(
  value: string,
): value is TaxStatementIncomeType {
  return (TAX_STATEMENT_INCOME_TYPES as readonly string[]).includes(value);
}
