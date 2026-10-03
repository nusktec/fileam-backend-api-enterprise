import { LEDGER_ACCOUNTS } from "./ledger";
import type { PayerIncomeCategory, PayerPaymentPurpose } from "./payer";
import type { PartyType, VendorCategory } from "./beneficiary";

export type ExpenseBalanceSheetKind = "fixed_asset" | "loan_repayment" | "tax_payment" | null;

/** Expense categories that are BS movements, not operating expense (postings PDF). */
export function expenseBalanceSheetKind(input: {
  category?: string | null;
  expenseType?: string | null;
  purchaseKind?: string | null;
}): ExpenseBalanceSheetKind {
  const category = (input.category ?? "").trim().toLowerCase();
  const type = (input.expenseType ?? "").trim().toLowerCase();
  const kind = (input.purchaseKind ?? "").trim().toLowerCase();
  if (
    kind === "fixed_asset" ||
    type === "capex" ||
    /fixed\s*asset/.test(category)
  ) {
    return "fixed_asset";
  }
  if (/loan\s*repay/.test(category)) return "loan_repayment";
  if (type === "tax" || /tax\s*payment/.test(category)) return "tax_payment";
  return null;
}

export function payerIncomeAccount(input: {
  purpose: string;
  incomeCategory?: string | null;
}): { code: string; name?: string } {
  const purpose = input.purpose as PayerPaymentPurpose;
  if (purpose === "INSURANCE_PROCEEDS" || purpose === "OTHER_INCOME") {
    return { code: LEDGER_ACCOUNTS.OTHER_INCOME };
  }
  if (purpose === "INVESTMENT_INCOME") {
    return { code: LEDGER_ACCOUNTS.INVESTMENT_INCOME };
  }
  const cat = (input.incomeCategory ?? "") as PayerIncomeCategory;
  switch (cat) {
    case "SALE_OF_GOODS":
      return { code: LEDGER_ACCOUNTS.SALES_REVENUE };
    case "PROVISION_OF_SERVICES":
    case "CONTRACT_PROJECT":
      return { code: LEDGER_ACCOUNTS.SERVICE_REVENUE };
    case "PROFESSIONAL_CONSULTANCY":
      return { code: LEDGER_ACCOUNTS.CONSULTING_FEES };
    case "COMMISSION_BROKERAGE":
      return { code: LEDGER_ACCOUNTS.COMMISSION_INCOME };
    case "RENT_LEASE":
      return { code: LEDGER_ACCOUNTS.RENTAL_INCOME };
    case "INTEREST_INCOME":
      return { code: LEDGER_ACCOUNTS.INTEREST_INCOME };
    case "DIVIDEND_INCOME":
      return { code: LEDGER_ACCOUNTS.DIVIDEND_INCOME };
    default:
      return { code: LEDGER_ACCOUNTS.SALES_REVENUE };
  }
}

export function isPayerIncomePurpose(purpose: string): boolean {
  return (
    purpose === "SALES" ||
    purpose === "OTHER_INCOME" ||
    purpose === "INSURANCE_PROCEEDS" ||
    purpose === "INVESTMENT_INCOME"
  );
}

export function isFinalWhtIncomeCategory(incomeCategory?: string | null): boolean {
  return (
    incomeCategory === "INTEREST_INCOME" || incomeCategory === "DIVIDEND_INCOME"
  );
}

export function beneficiaryGrossDebitAccount(input: {
  beneficiaryType: string;
  vendorCategory?: string | null;
  partyType?: string | null;
  entryType?: "INVOICE" | "PAYMENT";
}): string {
  const payment = input.entryType !== "INVOICE";
  if (input.beneficiaryType === "VENDOR") {
    const cat = input.vendorCategory as VendorCategory | null;
    switch (cat) {
      case "PURCHASES":
        return LEDGER_ACCOUNTS.INVENTORY;
      case "DIVIDENDS":
        return LEDGER_ACCOUNTS.OPENING_BALANCE;
      case "GENERAL_CONSTRUCTION":
        return LEDGER_ACCOUNTS.FIXED_ASSET;
      case "CONSULTANCY_PROFESSIONAL_FEES":
        return LEDGER_ACCOUNTS.PROFESSIONAL_FEES;
      case "COMPENSATION_LOSS_OF_EMPLOYMENT":
        return LEDGER_ACCOUNTS.SALARY_EXPENSE;
      default:
        return LEDGER_ACCOUNTS.EXPENSE;
    }
  }
  const party = input.partyType as PartyType | null;
  switch (party) {
    case "EMPLOYEE":
      return payment
        ? LEDGER_ACCOUNTS.SALARY_PAYABLE
        : LEDGER_ACCOUNTS.SALARY_EXPENSE;
    case "GOVERNMENT_TAX_AUTHORITY":
      return LEDGER_ACCOUNTS.TAX_PAYABLE;
    case "PENSION_STATUTORY_BODY":
      return LEDGER_ACCOUNTS.PENSION_PAYABLE;
    case "LENDER_FINANCIAL_INSTITUTION":
      return LEDGER_ACCOUNTS.LOAN_LIABILITY;
    case "LANDLORD":
      return LEDGER_ACCOUNTS.RENT_EXPENSE;
    case "INSURANCE_PROVIDER":
      return LEDGER_ACCOUNTS.INSURANCE_EXPENSE;
    case "DIRECTOR":
      return LEDGER_ACCOUNTS.PROFESSIONAL_FEES;
    case "SHAREHOLDER_INVESTOR":
    case "OWNER_PARTNER":
    case "CHARITY_NON_PROFIT":
    case "INDIVIDUAL_PERSONAL":
      return LEDGER_ACCOUNTS.OPENING_BALANCE;
    default:
      return LEDGER_ACCOUNTS.EXPENSE;
  }
}

export function fixedAssetLedgerCode(assetType?: string | null): string {
  switch ((assetType ?? "").trim()) {
    case "VEHICLE":
      return "1510";
    case "COMPUTER_IT":
      return "1520";
    case "MACHINERY":
      return "1530";
    case "FURNITURE":
      return "1540";
    case "BUILDING":
      return "1550";
    case "SOFTWARE_LICENSES":
      return "1560";
    case "LAND":
      return "1570";
    default:
      return "1580";
  }
}
