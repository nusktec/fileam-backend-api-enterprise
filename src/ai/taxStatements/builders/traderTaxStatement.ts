import { isUndoneStatus } from "../../../constants/recordUndo";
import { resolveCapitalAllowanceUse } from "../../../mobile/services/capitalAllowanceService";
import {
  monthsHeldInPeriod,
  naira,
  plLine,
  statementFourthScheduleTax,
  taxLine,
} from "../taxStatementMath";
import { pitReliefsFromDraft } from "../taxStatementReliefs";
import {
  catKey,
  isSkippedOperatingExpense,
  type TaxStatementContext,
} from "../taxStatementSources";
import { payerWhtCredit } from "../employerYear";
import type { TaxStatementResult } from "../taxStatementTypes";

function saleBucket(category: string | null): "sales" | "other" | "skip" {
  const c = catKey(category);
  if (c === "interest income") return "skip";
  if (
    c === "rental income" ||
    c === "gift" ||
    c === "subsidies" ||
    c === "grant" ||
    c === "other income" ||
    c === "other"
  ) {
    return "other";
  }
  return "sales";
}

function depAmort(ctx: TaxStatementContext): { dep: number; amort: number } {
  let dep = 0;
  let amort = 0;
  const { period } = ctx;
  for (const asset of ctx.assets) {
    if (asset.assetType === "LAND") continue;
    const purchase = asset.purchaseDate;
    if (purchase && purchase > period.periodEnd) continue;
    const disposal = ctx.assetDisposals.find(
      (d) =>
        (d.assetId === asset.id || d.assetId === asset.assetCode) &&
        !isUndoneStatus(d.status),
    );
    if (disposal?.disposalDate && disposal.disposalDate < period.periodStart) {
      continue;
    }
    const held = monthsHeldInPeriod({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      purchaseYmd: purchase,
      exitYmd: disposal?.disposalDate ?? null,
    });
    const charge = naira((asset.annualDepreciation * held) / 12);
    if (asset.assetType === "SOFTWARE_LICENSES") amort += charge;
    else dep += charge;
  }
  return { dep: naira(dep), amort: naira(amort) };
}

export function buildTraderTaxStatement(
  ctx: TaxStatementContext,
): TaxStatementResult {
  const { period } = ctx;
  let salesRevenue = ctx.orphanInventorySales;
  let otherOp = 0;
  let wht = 0;

  for (const sale of ctx.sales) {
    const bucket = saleBucket(sale.category);
    if (bucket === "sales") salesRevenue += sale.amount;
    else if (bucket === "other") otherOp += sale.amount;
  }

  if (!ctx.payerFeesIncludedInSales) {
    for (const tx of ctx.payerTxs) {
      const cat = catKey(tx.category);
      const purpose = catKey(tx.purpose);
      if (cat === "interest_income" || cat === "dividend_income") continue;
      if (
        cat === "sale_of_goods" ||
        cat === "provision_of_services" ||
        cat === "professional_consultancy" ||
        cat === "contract_project" ||
        cat === "commission_brokerage"
      ) {
        salesRevenue += tx.amount;
        if (tx.whtApplicable) wht += payerWhtCredit(tx.amount, tx.whtRate);
      } else if (
        cat === "rent_lease" ||
        cat === "other_business" ||
        purpose === "investment_income"
      ) {
        otherOp += tx.amount;
        if (tx.whtApplicable) wht += payerWhtCredit(tx.amount, tx.whtRate);
      }
    }
  }

  const cogsSrc = ctx.inventoryCogs;
  let opening = cogsSrc?.openingInventory ?? 0;
  let purchases = cogsSrc?.purchases ?? 0;
  let freight = cogsSrc?.directAcquisitionCosts ?? 0;
  let closing = cogsSrc?.closingInventory ?? 0;
  if (freight === 0) {
    freight = ctx.expenses
      .filter((e) => !isSkippedOperatingExpense(e.category, e.expenseType))
      .filter((e) => {
        const k = catKey(e.category);
        return k === "freight & logistics" || k === "delivery costs";
      })
      .reduce((s, e) => s + e.amount, 0);
  }
  const direct = ctx.expenses
    .filter((e) => !isSkippedOperatingExpense(e.category, e.expenseType))
    .filter((e) => {
      const k = catKey(e.category);
      return (
        k === "packaging" ||
        k === "production materials" ||
        k === "direct service costs"
      );
    })
    .reduce((s, e) => s + e.amount, 0);

  const usedCogsCats = new Set([
    "freight & logistics",
    "delivery costs",
    "packaging",
    "production materials",
    "direct service costs",
    "inventory purchases",
    "bank charges",
  ]);

  let salaries = ctx.payrollTotal;
  const salaryExp = ctx.expenses
    .filter((e) => !isSkippedOperatingExpense(e.category, e.expenseType))
    .filter((e) => catKey(e.category) === "salaries" || catKey(e.category) === "salary")
    .reduce((s, e) => s + e.amount, 0);
  if (salaries === 0) salaries = salaryExp;

  let rent = 0;
  let utilities = 0;
  let marketing = 0;
  let communication = 0;
  let professional = 0;
  let software = 0;
  let insurance = 0;
  let repairs = 0;
  let otherOpEx = 0;
  let bankCharges = 0;

  for (const e of ctx.expenses) {
    if (isSkippedOperatingExpense(e.category, e.expenseType)) continue;
    const k = catKey(e.category);
    if (ctx.payrollTotal > 0 && (k === "salaries" || k === "salary")) continue;
    if (k === "office rent") rent += e.amount;
    else if (k === "electricity" || k === "waste collection") utilities += e.amount;
    else if (k === "marketing") marketing += e.amount;
    else if (k === "internet" || k === "airtime") communication += e.amount;
    else if (k === "accounting fees" || k === "legal fees" || k === "project contractors") {
      professional += e.amount;
    } else if (k === "tools & software") software += e.amount;
    else if (k === "insurance") insurance += e.amount;
    else if (k === "bank charges") bankCharges += e.amount;
    else if (usedCogsCats.has(k) && k !== "bank charges") continue;
    else if (k === "office supplies" || k === "other" || true) {
      if (
        k === "freight & logistics" ||
        k === "delivery costs" ||
        k === "packaging" ||
        k === "production materials" ||
        k === "direct service costs" ||
        k === "inventory purchases"
      ) {
        continue;
      }
      if (k !== "bank charges") otherOpEx += e.amount;
    }
  }
  for (const p of ctx.prepayments) {
    const k = catKey(p.category);
    if (k === "lease") rent += p.amount;
    else if (k === "software" || k === "license") software += p.amount;
    else if (k === "insurance") insurance += p.amount;
    else if (k === "maintenance") repairs += p.amount;
    else otherOpEx += p.amount;
  }

  const { dep, amort } = depAmort(ctx);
  const totalRevenue = naira(salesRevenue + otherOp);
  const costOfSales = naira(opening + purchases + freight + direct - closing);
  const grossProfit = naira(totalRevenue - costOfSales);
  const totalOpEx = naira(
    salaries +
      rent +
      utilities +
      0 +
      repairs +
      marketing +
      communication +
      professional +
      software +
      insurance +
      dep +
      amort +
      otherOpEx,
  );
  const operatingProfit = naira(grossProfit - totalOpEx);
  const pbt = naira(operatingProfit - ctx.loanInterest - bankCharges - 0);

  const use = resolveCapitalAllowanceUse({
    taxPersona: "TRADER",
    solopreneurRegistration: null,
  });
  const capitalAllowance =
    use.tax === "PIT"
      ? Math.min(ctx.capitalAllowanceAvailable, Math.max(0, pbt))
      : 0;

  const reliefs = pitReliefsFromDraft(ctx.pitDraft, period);
  const ownerReliefs = naira(
    (reliefs.pensionOverride != null
      ? reliefs.pensionOverride
      : reliefs.extraPension) + reliefs.applicableReliefs,
  );
  const chargeable = Math.max(0, pbt - naira(capitalAllowance) - ownerReliefs - 0);
  const pit = statementFourthScheduleTax(chargeable);
  const net = naira(pit - wht);

  return {
    incomeType: "TRADER",
    year: period.year,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    currency: "NGN",
    profitAndLoss: [
      plLine("Revenue", "Sales Revenue", salesRevenue),
      plLine("Revenue", "Other Operating Income", otherOp),
      plLine("Revenue", "Total Revenue", totalRevenue),
      plLine("Cost of Sales", "Opening Inventory", opening),
      plLine("Cost of Sales", "Purchases", purchases),
      plLine("Cost of Sales", "Import/Freight Costs", freight),
      plLine("Cost of Sales", "Direct Costs", direct),
      plLine("Cost of Sales", "Less: Closing Inventory", closing),
      plLine("Cost of Sales", "Cost of Sales", costOfSales),
      plLine("Cost of Sales", "Gross Profit", grossProfit),
      plLine("Operating Expenses", "Salaries & Wages", salaries),
      plLine("Operating Expenses", "Rent", rent),
      plLine("Operating Expenses", "Utilities", utilities),
      plLine("Operating Expenses", "Transport", 0),
      plLine("Operating Expenses", "Repairs & Maintenance", repairs),
      plLine("Operating Expenses", "Marketing & Advertising", marketing),
      plLine("Operating Expenses", "Communication", communication),
      plLine("Operating Expenses", "Professional Fees", professional),
      plLine("Operating Expenses", "Software & Subscriptions", software),
      plLine("Operating Expenses", "Insurance", insurance),
      plLine("Operating Expenses", "Depreciation", dep),
      plLine("Operating Expenses", "Amortisation", amort),
      plLine("Operating Expenses", "Other Operating Expenses", otherOpEx),
      plLine("Operating Expenses", "Total Operating Expenses", totalOpEx),
      plLine("Operating Expenses", "Operating Profit", operatingProfit),
      plLine("Finance Costs", "Interest Expense", ctx.loanInterest),
      plLine("Finance Costs", "Bank Charges", bankCharges),
      plLine("Finance Costs", "Other Finance Costs", 0),
      plLine("Finance Costs", "Profit Before Tax", pbt),
    ],
    taxComputation: [
      taxLine("Accounting Profit", pbt),
      taxLine("Less: Capital Allowance", capitalAllowance),
      taxLine("Less: Applicable Tax Reliefs/Deductions", ownerReliefs),
      taxLine("Less: Other Eligible Tax Savings", 0),
      taxLine("Taxable/Chargeable Income", chargeable),
      taxLine("PIT or CIT Liability (based on legal structure)", pit),
      taxLine("Less: WHT Tax Credits", wht),
      taxLine("Less: Other Tax Credits", 0),
      taxLine("Net PIT/CIT Payable/(Refundable)", net),
    ],
  };
}
