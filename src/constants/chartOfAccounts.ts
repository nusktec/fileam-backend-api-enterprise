import { normalizeMoneyAmount } from "../utils/monetaryAmount";

/**
 * FileAm chart of accounts (LEDGER.pdf). Numeric codes only — no equity accounts.
 */

export type ChartSectionType =
  | "asset"
  | "contra_asset"
  | "liability"
  | "income"
  | "non_operating_income"
  | "cost_of_sales"
  | "expense"
  | "finance_cost"
  | "tax";

export type ChartLineType =
  | "asset"
  | "contra_asset"
  | "liability"
  | "income"
  | "expense";

export type ChartAccount = {
  code: string;
  name: string;
  sectionType: ChartSectionType;
  lineType: ChartLineType;
  /** Balance sheet (closing) vs profit-and-loss (movement). */
  reportClass: "balance_sheet" | "profit_and_loss";
  normalDebit: boolean;
};

export const CHART_SECTION_ORDER: Array<{
  type: ChartSectionType;
  label: string;
}> = [
  { type: "asset", label: "Assets" },
  { type: "contra_asset", label: "Contra-assets" },
  { type: "liability", label: "Liabilities" },
  { type: "income", label: "Revenue" },
  { type: "non_operating_income", label: "Non-operating income" },
  { type: "cost_of_sales", label: "Cost of sales" },
  { type: "expense", label: "Operating expenses" },
  { type: "finance_cost", label: "Finance costs" },
  { type: "tax", label: "Tax accounts" },
];

const bsDebit = true;
const bsCredit = false;

export const CHART_ACCOUNTS: ChartAccount[] = [
  { code: "1110", name: "Cash on Hand", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1120", name: "Bank Balances", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1130", name: "Accounts Receivable – Customers", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1140", name: "Asset Sale Receivable", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1150", name: "Employee/Director Advance Receivable", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1160", name: "Vendor Refund Receivable", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1170", name: "Insurance Claim/Recovery Receivable", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1180", name: "Tax Refund/VAT Credit Receivable", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1190", name: "Investment Income Receivable", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1200", name: "Inventory", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1300", name: "Prepayments", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1400", name: "Other Current Assets", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1510", name: "Vehicles", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1520", name: "Computer & IT", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1530", name: "Machinery", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1540", name: "Furniture", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1550", name: "Buildings", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1560", name: "Software Licences", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1570", name: "Land", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1580", name: "Others", sectionType: "asset", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "1610", name: "Accumulated Depreciation – Vehicles", sectionType: "contra_asset", lineType: "contra_asset", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "1620", name: "Accumulated Depreciation – Computer & IT", sectionType: "contra_asset", lineType: "contra_asset", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "1630", name: "Accumulated Depreciation – Machinery", sectionType: "contra_asset", lineType: "contra_asset", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "1640", name: "Accumulated Depreciation – Furniture", sectionType: "contra_asset", lineType: "contra_asset", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "1650", name: "Accumulated Depreciation – Buildings", sectionType: "contra_asset", lineType: "contra_asset", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "1660", name: "Accumulated Amortisation – Software Licences", sectionType: "contra_asset", lineType: "contra_asset", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "1680", name: "Accumulated Depreciation – Others", sectionType: "contra_asset", lineType: "contra_asset", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2110", name: "Accounts Payable", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2120", name: "Other Payables", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2130", name: "Salary Payable", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2140", name: "PAYE Payable", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2150", name: "Pension Payable", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2160", name: "WHT Payable", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2170", name: "VAT Payable", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2180", name: "Short-Term Loan Liability", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2190", name: "Other Current Liabilities", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2210", name: "Long-Term Loan Liability", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "2220", name: "Other Long-Term Liabilities", sectionType: "liability", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "4110", name: "Sales Revenue", sectionType: "income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4120", name: "Service Revenue", sectionType: "income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4130", name: "Consultancy/Professional Income", sectionType: "income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4140", name: "Commission Income", sectionType: "income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4150", name: "Rental Income", sectionType: "income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4160", name: "Other Operating Income", sectionType: "income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4210", name: "Investment Income", sectionType: "non_operating_income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4220", name: "Interest Income", sectionType: "non_operating_income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4230", name: "Dividend Income", sectionType: "non_operating_income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4240", name: "Gain on Disposal of Assets", sectionType: "non_operating_income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4250", name: "Insurance Recovery Income", sectionType: "non_operating_income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "4290", name: "Other Income", sectionType: "non_operating_income", lineType: "income", reportClass: "profit_and_loss", normalDebit: bsCredit },
  { code: "5110", name: "Cost of Goods Sold", sectionType: "cost_of_sales", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "5120", name: "Purchases for Resale", sectionType: "cost_of_sales", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "5130", name: "Direct Materials", sectionType: "cost_of_sales", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "5140", name: "Direct Labour", sectionType: "cost_of_sales", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "5150", name: "Production Costs", sectionType: "cost_of_sales", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "5160", name: "Freight/Import Costs", sectionType: "cost_of_sales", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "5190", name: "Other Direct Costs", sectionType: "cost_of_sales", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6110", name: "Salaries & Wages Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6120", name: "Pension Expense – Employer", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6130", name: "Rent Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6140", name: "Utilities Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6150", name: "Transport & Travel Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6160", name: "Repairs & Maintenance", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6170", name: "Marketing & Advertising", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6180", name: "Professional Fees", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6190", name: "Consultancy Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6200", name: "Software & Subscriptions", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6210", name: "Insurance Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6220", name: "Communication Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6230", name: "Office Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6240", name: "Depreciation Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6250", name: "Amortisation Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6260", name: "Bad Debt Expense", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "6290", name: "Other Operating Expenses", sectionType: "expense", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "7110", name: "Loan Interest Expense", sectionType: "finance_cost", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "7120", name: "Bank Charges", sectionType: "finance_cost", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "7130", name: "Loan Fees", sectionType: "finance_cost", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "7190", name: "Other Finance Costs", sectionType: "finance_cost", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
  { code: "8120", name: "WHT Tax Credit Receivable", sectionType: "tax", lineType: "asset", reportClass: "balance_sheet", normalDebit: bsDebit },
  { code: "8150", name: "Income Tax Payable", sectionType: "tax", lineType: "liability", reportClass: "balance_sheet", normalDebit: bsCredit },
  { code: "8160", name: "Income Tax Expense", sectionType: "tax", lineType: "expense", reportClass: "profit_and_loss", normalDebit: bsDebit },
];

export const CHART_BY_CODE = new Map(CHART_ACCOUNTS.map((a) => [a.code, a]));

const INTERNAL_TO_CHART: Record<string, string> = {
  CASH_ON_HAND: "1110",
  PETTY_CASH: "1110",
  OTHER_CASH: "1110",
  BANK: "1120",
  CARD_SETTLEMENT: "1120",
  CUSTOMER_AR: "1130",
  ASSET_SALE_RECEIVABLE: "1140",
  EMPLOYEE_ADVANCE_RECEIVABLE: "1150",
  VENDOR_REFUND_RECEIVABLE: "1160",
  TAX_REFUND_RECEIVABLE: "1180",
  INVESTMENT_INCOME_RECEIVABLE: "1190",
  FIXED_ASSET: "1580",
  ACCUMULATED_DEPRECIATION: "1680",
  ACCOUNTS_PAYABLE: "2110",
  SALARY_PAYABLE: "2130",
  PAYE_PAYABLE: "2140",
  PENSION_PAYABLE: "2150",
  WHT_PAYABLE: "2160",
  VAT_PAYABLE: "2170",
  LOAN_LIABILITY: "2180",
  SALES_REVENUE: "4110",
  INVESTMENT_INCOME: "4210",
  EXPENSE: "6290",
  SALARY_EXPENSE: "6110",
  FINANCE_COST: "7110",
  DEPRECIATION_EXPENSE: "6240",
  GAIN_ON_DISPOSAL: "4240",
  LOSS_ON_DISPOSAL: "6290",
  WHT_TAX_CREDIT: "8120",
  TAX_PAYABLE: "8150",
  ASSET_SALE_PROCEEDS: "1140",
};

/** Map internal ledger account code to chart code. Null = omit (equity or unknown — do not invent). */
export function resolveChartAccountCode(internalCode: string): string | null {
  if (/^\d{4}$/.test(internalCode)) {
    return CHART_BY_CODE.has(internalCode) ? internalCode : null;
  }
  if (internalCode.startsWith("BANK:")) return "1120";
  if (
    internalCode.startsWith("OWNER_") ||
    internalCode === "OTHER_EQUITY" ||
    internalCode === "TRANSFER_CLEARING" ||
    internalCode === "EXISTING_BUSINESS_FUNDS"
  ) {
    return null;
  }
  return INTERNAL_TO_CHART[internalCode] ?? null;
}

/** Dashboard: BS sections close as at today; P&L + tax sections are YTD. */
export function dashboardUsesClosingBalance(account: ChartAccount): boolean {
  return (
    account.sectionType === "asset" ||
    account.sectionType === "contra_asset" ||
    account.sectionType === "liability"
  );
}

export function balanceToTrialSides(
  account: ChartAccount,
  netDebitMinusCredit: number,
): { debit: number; credit: number } {
  const amount = normalizeMoneyAmount(Math.abs(netDebitMinusCredit));
  if (amount === 0) return { debit: 0, credit: 0 };
  if (account.normalDebit) {
    return netDebitMinusCredit >= 0
      ? { debit: amount, credit: 0 }
      : { debit: 0, credit: amount };
  }
  return netDebitMinusCredit <= 0
    ? { debit: 0, credit: amount }
    : { debit: amount, credit: 0 };
}
