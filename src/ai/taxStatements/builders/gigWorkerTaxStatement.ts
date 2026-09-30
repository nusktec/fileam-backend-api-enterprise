import { resolveCapitalAllowanceUse } from "../../../mobile/services/capitalAllowanceService";
import {
  naira,
  plLine,
  statementFourthScheduleTax,
  taxLine,
} from "../taxStatementMath";
import { pitReliefsFromDraft } from "../taxStatementReliefs";
import {
  catKey,
  liveReceivables,
  type TaxStatementContext,
} from "../taxStatementSources";
import {
  employerPayeCredit,
  employerWhtCredit,
  employerYearAmount,
  isMinWageEmploymentGross,
  payerWhtCredit,
} from "../employerYear";
import type { TaxStatementResult } from "../taxStatementTypes";

function saleBucket(
  category: string | null,
): "customer" | "commission" | "invest" | "skip" {
  const c = catKey(category);
  if (!c) return "customer";
  if (c === "commission income") return "commission";
  if (
    c === "service revenue" ||
    c === "service income" ||
    c === "consulting fees" ||
    c === "consulting" ||
    c === "product sales" ||
    c === "subscription revenue" ||
    c === "subscription" ||
    c === "delivery charges"
  ) {
    return "customer";
  }
  if (c === "interest income") return "skip";
  if (
    c === "rental income" ||
    c === "gift" ||
    c === "subsidies" ||
    c === "grant" ||
    c === "other income" ||
    c === "other"
  ) {
    return "invest";
  }
  return "customer";
}

export function buildGigWorkerTaxStatement(
  ctx: TaxStatementContext,
): TaxStatementResult {
  const { period } = ctx;
  let customer = 0;
  let commission = 0;
  let investment = 0;
  let otherTaxable = 0;
  let employment = 0;
  let pension = 0;
  let wht = 0;
  let paye = 0;
  const employmentYears = [];

  for (const emp of ctx.employers) {
    const year = employerYearAmount(emp, period);
    if (!year.included) continue;
    pension += year.pension;
    if (emp.relationship === "CONTRACTOR") {
      customer += year.gross;
      wht += employerWhtCredit(year);
      continue;
    }
    employmentYears.push(year);
    employment += year.gross;
    paye += employerPayeCredit(year);
  }

  for (const sale of ctx.sales) {
    const bucket = saleBucket(sale.category);
    if (bucket === "customer") customer += sale.amount;
    else if (bucket === "commission") commission += sale.amount;
    else if (bucket === "invest") otherTaxable += sale.amount;
  }

  if (!ctx.payerFeesIncludedInSales) {
    for (const tx of ctx.payerTxs) {
      const cat = catKey(tx.category);
      const purpose = catKey(tx.purpose);
      if (cat === "interest_income" || cat === "dividend_income") continue;
      if (purpose === "investment_income") {
        investment += tx.amount;
        if (tx.whtApplicable) wht += payerWhtCredit(tx.amount, tx.whtRate);
        continue;
      }
      if (
        cat === "contract_project" ||
        cat === "provision_of_services" ||
        cat === "professional_consultancy" ||
        cat === "sale_of_goods"
      ) {
        customer += tx.amount;
        if (tx.whtApplicable) wht += payerWhtCredit(tx.amount, tx.whtRate);
      } else if (cat === "commission_brokerage") {
        commission += tx.amount;
        if (tx.whtApplicable) wht += payerWhtCredit(tx.amount, tx.whtRate);
      } else if (cat === "rent_lease" || cat === "other_business") {
        otherTaxable += tx.amount;
        if (tx.whtApplicable) wht += payerWhtCredit(tx.amount, tx.whtRate);
      }
    }
  }

  for (const rec of liveReceivables(ctx.receivables, period)) {
    if (rec.incomeType === "OTHER_INVESTMENT_INCOME") {
      investment += rec.incomeAmount;
      wht += rec.whtDeducted;
    }
  }

  let transport = 0;
  let internet = 0;
  let equipment = 0;
  let repairs = 0;
  let professional = 0;
  let otherExp = 0;
  for (const e of ctx.expenses) {
    const k = catKey(e.category);
    const t = catKey(e.expenseType);
    if (
      k === "fixed asset purchase" ||
      k === "loan repayment" ||
      k === "tax payment" ||
      k === "capital expense" ||
      t === "capex" ||
      t === "capital expense"
    ) {
      continue;
    }
    if (k === "delivery costs" || k === "freight & logistics") transport += e.amount;
    else if (k === "internet" || k === "airtime") internet += e.amount;
    else if (k === "tools & software") equipment += e.amount;
    else if (k === "accounting fees" || k === "legal fees" || k === "project contractors") {
      professional += e.amount;
    } else otherExp += e.amount;
  }
  for (const p of ctx.prepayments) {
    const k = catKey(p.category);
    if (k === "maintenance") repairs += p.amount;
    else otherExp += p.amount;
  }

  const totalRevenue = naira(customer + 0 + commission + 0);
  const totalExpenses = naira(
    transport + 0 + internet + equipment + repairs + professional + otherExp,
  );
  const netProfit = naira(totalRevenue - totalExpenses);
  const totalIncome = naira(netProfit + investment + otherTaxable);

  const use = resolveCapitalAllowanceUse({
    taxPersona: "GIG_WORKER",
    solopreneurRegistration: null,
  });
  const capitalAllowance =
    use.tax === "PIT"
      ? Math.min(ctx.capitalAllowanceAvailable, Math.max(0, netProfit))
      : 0;

  const reliefs = pitReliefsFromDraft(ctx.pitDraft, period);
  const eligiblePension =
    reliefs.pensionOverride != null
      ? naira(reliefs.pensionOverride)
      : naira(pension + reliefs.extraPension);

  const totalTaxable = naira(netProfit + employment + investment + otherTaxable);
  const minWage =
    employmentYears.length > 0 &&
    employmentYears.every((y) => isMinWageEmploymentGross(y.gross)) &&
    totalRevenue === 0 &&
    netProfit <= 0 &&
    investment === 0 &&
    otherTaxable === 0;

  let chargeable = Math.max(
    0,
    totalTaxable -
      eligiblePension -
      reliefs.applicableReliefs -
      naira(capitalAllowance) -
      0,
  );
  let pit = statementFourthScheduleTax(chargeable);
  if (minWage) {
    chargeable = 0;
    pit = 0;
  }
  const net = naira(pit - wht - paye);

  return {
    incomeType: "GIG_WORKER",
    year: period.year,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    currency: "NGN",
    profitAndLoss: [
      plLine("Gig/Service Revenue", "Customer Revenue", customer),
      plLine("Gig/Service Revenue", "Platform/Gig Revenue", 0),
      plLine("Gig/Service Revenue", "Commission Revenue", commission),
      plLine("Gig/Service Revenue", "Other Gig Income", 0),
      plLine("Gig/Service Revenue", "Total Revenue", totalRevenue),
      plLine("Direct Gig Expenses", "Transportation", transport),
      plLine("Direct Gig Expenses", "Platform/Commission Fees", 0),
      plLine("Direct Gig Expenses", "Internet & Communication", internet),
      plLine("Direct Gig Expenses", "Equipment/Tools", equipment),
      plLine("Direct Gig Expenses", "Repairs & Maintenance", repairs),
      plLine("Direct Gig Expenses", "Professional Fees", professional),
      plLine("Direct Gig Expenses", "Other Business Expenses", otherExp),
      plLine("Direct Gig Expenses", "Total Expenses", totalExpenses),
      plLine("Direct Gig Expenses", "Net Business Profit", netProfit),
      plLine("Other Income", "Investment Income", investment),
      plLine("Other Income", "Other Taxable Income", otherTaxable),
      plLine("Other Income", "Total Income", totalIncome),
    ],
    taxComputation: [
      taxLine("Net Business Profit", netProfit),
      taxLine("Employment Income, if applicable", employment),
      taxLine("Investment/Other Taxable Income", naira(investment + otherTaxable)),
      taxLine("Total Taxable Income", totalTaxable),
      taxLine("Less: Eligible Pension Contribution", eligiblePension),
      taxLine("Less: Applicable Reliefs/Deductions", reliefs.applicableReliefs),
      taxLine("Less: Capital Allowance, where applicable", capitalAllowance),
      taxLine("Less: Other Eligible Tax Savings", 0),
      taxLine("Chargeable Income", chargeable),
      taxLine("PIT Liability", pit),
      taxLine("Less: WHT Tax Credits", wht),
      taxLine("Less: PAYE/Tax Credits", paye),
      taxLine("Less: Other Tax Credits", 0),
      taxLine("Net PIT Payable/(Refundable)", net),
    ],
  };
}
