/**
 * Central percentage and tax-rate constants. Adjust legal/business rates here.
 *
 * - Use `PERCENT` as the divisor to turn “percentage points” into a decimal (e.g. 7.5% → 7.5 / PERCENT).
 * - Use `PERCENT` as the multiplier to turn a ratio into a 0–100 display value (e.g. share of total).
 */

/** 100 — percentage-point divisor and ratio→%-display multiplier. */
export const PERCENT = 100;

/** Standard VAT rate (percentage points) for sales, seeds, and display strings. */
export const VAT_RATE_PERCENT = 7.5;

/** WHT on services — mobile tax preview and enterprise fallbacks. */
export const WHT_RATE_SERVICES_PERCENT = 5;

/** NTA 2025 s.56 — small company CIT rate (percent). */
export const CIT_RATE_SMALL_COMPANY_PERCENT = 0;

/** NTA 2025 s.56 — standard company CIT rate (percent). */
export const CIT_RATE_STANDARD_PERCENT = 30;

/** VAT registration turnover threshold (NGN) — mobile tax preview “% of threshold”. */
export const VAT_TURNOVER_THRESHOLD_NGN = 100_000_000;

/** NTA 2025 s.201 — small-company turnover cap (NGN). */
export const CIT_TURNOVER_THRESHOLD_NGN = 100_000_000;

/** NTA 2025 s.201 — small-company fixed-assets cap (NGN). */
export const CIT_FIXED_ASSETS_THRESHOLD_NGN = 250_000_000;

/** @deprecated Use CIT_TURNOVER_THRESHOLD_NGN — kept for legacy imports. */
export const CIT_PROFIT_THRESHOLD_NGN = CIT_TURNOVER_THRESHOLD_NGN;

/** Inventory: flag “moving low” when 60d sales are below this share of on-hand quantity (percentage points). */
export const INVENTORY_MOVING_LOW_STOCK_SHARE_PERCENT = 5;

/** Analytics KPIs: round displayed % change / margin to one decimal (×n then /n). */
export const KPI_PERCENT_ROUNDING_FACTOR = 10;

/** Round a 0–100 percent value to two decimal places (×PERCENT then /PERCENT). */
export const PERCENT_TWO_DECIMAL_ROUND = 100;

/** Margin / item marginPct: ratio × PERCENT × PERCENT_TWO_DECIMAL_ROUND / PERCENT → two decimal places on %. */
export const MARGIN_PERCENT_NUMERATOR = PERCENT * PERCENT_TWO_DECIMAL_ROUND;

/** Enterprise dashboard: potential savings as share of estimated monthly tax due. */
export const ENTERPRISE_POTENTIAL_TAX_SAVINGS_RATE = 0.05;
export const ENTERPRISE_POTENTIAL_TAX_SAVINGS_CAP_NGN = 500_000;

/** Weekly savings hint as share of monthly savings estimate. */
export const ENTERPRISE_POTENTIAL_TAX_SAVINGS_WEEKLY_RATE = 0.2;
export const ENTERPRISE_POTENTIAL_TAX_SAVINGS_WEEKLY_CAP_NGN = 100_000;

/**
 * Enterprise `getBalanceSheet` mock splits (fractions of income / expenses — not tax rates).
 * Replace with real accounting when available.
 */
export const BALANCE_SHEET_MOCK_CURRENT_ASSETS_OF_INCOME = 0.3;
export const BALANCE_SHEET_MOCK_FIXED_ASSETS_OF_INCOME = 0.2;
/** Sum of the two asset fractions above (total assets placeholder). */
export const BALANCE_SHEET_MOCK_TOTAL_ASSETS_OF_INCOME =
  BALANCE_SHEET_MOCK_CURRENT_ASSETS_OF_INCOME +
  BALANCE_SHEET_MOCK_FIXED_ASSETS_OF_INCOME;
export const BALANCE_SHEET_MOCK_LIABILITIES_OF_EXPENSE = 0.2;

/**
 * CIT in this API is modeled on **annual** profit (mobile preview annualizes monthly profit).
 * Override when `CIT_INDUSTRY_EXCEPTION_CATEGORIES` contains a transaction line category.
 */
export const CIT_INDUSTRY_EXCEPTION_CATEGORIES: string[] = [];

