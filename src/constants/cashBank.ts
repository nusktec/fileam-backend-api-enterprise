export const CASH_TYPES = [
  "cash_on_hand",
  "petty_cash",
  "other_cash",
] as const;

export type CashType = (typeof CASH_TYPES)[number];

export function isValidCashType(value: string): value is CashType {
  return (CASH_TYPES as readonly string[]).includes(value);
}

export const BANK_ACCOUNT_TYPES = [
  "current",
  "savings",
  "domiciliary",
  "other",
] as const;

export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export function isValidBankAccountType(
  value: string,
): value is BankAccountType {
  return (BANK_ACCOUNT_TYPES as readonly string[]).includes(value);
}

export const BANK_ACCOUNT_PURPOSES = [
  "business_operations",
  "payroll",
  "tax",
  "savings_reserve",
  "other",
] as const;

export type BankAccountPurpose = (typeof BANK_ACCOUNT_PURPOSES)[number];

export function isValidBankAccountPurpose(
  value: string,
): value is BankAccountPurpose {
  return (BANK_ACCOUNT_PURPOSES as readonly string[]).includes(value);
}

export const OPENING_BALANCE_SOURCES = [
  "existing_business_funds",
  "owner_capital_introduced",
  "transfer_from_another_business_account",
  "loan_proceeds",
  "other",
] as const;

export type OpeningBalanceSource = (typeof OPENING_BALANCE_SOURCES)[number];

export function isValidOpeningBalanceSource(
  value: string,
): value is OpeningBalanceSource {
  return (OPENING_BALANCE_SOURCES as readonly string[]).includes(value);
}

export const CASH_TYPE_LABELS: Record<CashType, string> = {
  cash_on_hand: "Cash on hand",
  petty_cash: "Petty cash",
  other_cash: "Other cash",
};

export const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  current: "Current",
  savings: "Savings",
  domiciliary: "Domiciliary",
  other: "Other",
};
