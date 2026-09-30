import {
  naira,
  plLine,
  splitByWeights,
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
import { resolveCapitalAllowanceUse } from "../../../mobile/services/capitalAllowanceService";

function saleBucket(category: string | null): "freelance" | "other" | "invest" | "skip" {
  const c = catKey(category);
  if (!c) return "other";
  if (c === "consulting fees" || c === "consulting") return "freelance";
  if (
    c === "service revenue" ||
    c === "service income" ||
    c === "subscription revenue" ||
    c === "subscription" ||
    c === "commission income" ||
    c === "delivery charges" ||
    c === "product sales"
  ) {
    return "other";
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
  return "other";
}

export function buildRemoteWorkerTaxStatement(
  ctx: TaxStatementContext,
): TaxStatementResult {
  const { period } = ctx;
  let salary = 0;
  let otherRem = 0;
  let contractRevenue = 0;
  let freelance = 0;
  let otherService = 0;
  let investment = 0;
  let pension = 0;
  let wht = 0;
  let paye = 0;
  const employmentYears = [];

  for (const emp of ctx.employers) {
    const year = employerYearAmount(emp, period);
    if (!year.included) continue;
    pension += year.pension;
    if (emp.relationship === "CONTRACTOR") {
      freelance += year.gross;
      wht += employerWhtCredit(year);
      continue;
    }
    employmentYears.push(year);
    paye += employerPayeCredit(year);
    if (year.hasHistory) {
      const [s, o] = splitByWeights(year.gross, [
        emp.basicSalary,
        emp.housingAllowance +
          emp.transportAllowance +
          emp.otherAllowances +
          emp.bonuses +
          emp.commissions,
      ]);
      if (
        emp.basicSalary +
          emp.housingAllowance +
          emp.transportAllowance +
          emp.otherAllowances +
          emp.bonuses +
          emp.commissions <=
        0
      ) {
        otherRem += year.gross;
      } else {
        salary += s;
        otherRem += o;
      }
    } else {
      const basicWeight = emp.basicSalary;
      const otherWeight =
        emp.housingAllowance +
        emp.transportAllowance +
        emp.otherAllowances +
        emp.bonuses +
        emp.commissions;
      const [s, o] = splitByWeights(year.gross, [basicWeight, otherWeight]);
      if (basicWeight + otherWeight <= 0) otherRem += year.gross;
      else {
        salary += s;
        otherRem += o;
      }
    }
  }

  for (const sale of ctx.sales) {
    const bucket = saleBucket(sale.category);
    if (bucket === "freelance") freelance += sale.amount;
    else if (bucket === "other") otherService += sale.amount;
    else if (bucket === "invest") investment += sale.amount;
  }

  if (!ctx.payerFeesIncludedInSales) {
    for (const tx of ctx.payerTxs) {
      const cat = catKey(tx.category);
      const purpose = catKey(tx.purpose);
      if (cat === "interest_income" || cat === "dividend_income") continue;
      if (cat === "contract_project") {
        contractRevenue += tx.amount;
        if (tx.whtApplicable) wht += payerWhtCredit(tx.amount, tx.whtRate);
      } else if (cat === "professional_consultancy") {
        freelance += tx.amount;
        if (tx.whtApplicable) wht += payerWhtCredit(tx.amount, tx.whtRate);
      } else if (
        cat === "provision_of_services" ||
        cat === "commission_brokerage" ||
        cat === "sale_of_goods"
      ) {
        otherService += tx.amount;
        if (tx.whtApplicable) wht += payerWhtCredit(tx.amount, tx.whtRate);
      } else if (
        cat === "rent_lease" ||
        cat === "other_business" ||
        purpose === "investment_income"
      ) {
        investment += tx.amount;
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

  let internet = 0;
  let software = 0;
  let professional = 0;
  let workspace = 0;
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
    if (k === "internet" || k === "airtime") internet += e.amount;
    else if (k === "tools & software") software += e.amount;
    else if (k === "accounting fees" || k === "legal fees" || k === "project contractors") {
      professional += e.amount;
    } else if (k === "office rent") workspace += e.amount;
    else otherExp += e.amount;
  }
  for (const p of ctx.prepayments) {
    const k = catKey(p.category);
    if (k === "software" || k === "license") software += p.amount;
    else if (k === "lease") workspace += p.amount;
    else otherExp += p.amount;
  }

  const employmentTotal = naira(salary + otherRem);
  const totalBizRev = naira(contractRevenue + freelance + otherService);
  const totalBizExp = naira(internet + software + professional + 0 + workspace + 0 + otherExp);
  const bizProfit = naira(totalBizRev - totalBizExp);
  const totalIncomeBeforeTax = naira(employmentTotal + bizProfit);

  const use = resolveCapitalAllowanceUse({
    taxPersona: "REMOTE_WORKER",
    solopreneurRegistration: null,
  });
  const capitalAllowance =
    use.tax === "PIT"
      ? Math.min(ctx.capitalAllowanceAvailable, Math.max(0, bizProfit))
      : 0;

  const reliefs = pitReliefsFromDraft(ctx.pitDraft, period);
  const eligiblePension =
    reliefs.pensionOverride != null
      ? naira(reliefs.pensionOverride)
      : naira(pension + reliefs.extraPension);

  const minWage =
    employmentYears.length > 0 &&
    employmentYears.every((y) => isMinWageEmploymentGross(y.gross)) &&
    bizProfit <= 0 &&
    investment === 0 &&
    totalBizRev === 0;

  let chargeable = Math.max(
    0,
    naira(employmentTotal + bizProfit + investment) -
      eligiblePension -
      reliefs.applicableReliefs -
      0 -
      naira(capitalAllowance),
  );
  let pit = statementFourthScheduleTax(chargeable);
  if (minWage) {
    chargeable = 0;
    pit = 0;
  }
  const net = naira(pit - wht - paye);

  return {
    incomeType: "REMOTE_WORKER",
    year: period.year,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    currency: "NGN",
    profitAndLoss: [
      plLine("Employment Income", "Salary & Wages", salary),
      plLine("Employment Income", "Other Employment Remuneration", otherRem),
      plLine("Employment Income", "Employment Income Total", employmentTotal),
      plLine("Business/Contract Income", "Contract Revenue", contractRevenue),
      plLine("Business/Contract Income", "Freelance/Professional Revenue", freelance),
      plLine("Business/Contract Income", "Other Service Revenue", otherService),
      plLine("Business/Contract Income", "Total Business Revenue", totalBizRev),
      plLine("Business Expenses", "Internet & Communication", internet),
      plLine("Business Expenses", "Software & Subscriptions", software),
      plLine("Business Expenses", "Professional Fees", professional),
      plLine("Business Expenses", "Transport & Travel", 0),
      plLine("Business Expenses", "Workspace/Rent", workspace),
      plLine("Business Expenses", "Equipment/Tools", 0),
      plLine("Business Expenses", "Other Allowable Business Expenses", otherExp),
      plLine("Business Expenses", "Total Business Expenses", totalBizExp),
      plLine("Business Expenses", "Business Profit", bizProfit),
      plLine(
        "Business Expenses",
        "Total Income Before Tax Computation",
        totalIncomeBeforeTax,
      ),
    ],
    taxComputation: [
      taxLine("Employment Income", employmentTotal),
      taxLine("Business/Contract Income", bizProfit),
      taxLine("Investment/Other Taxable Income", investment),
      taxLine("Total Taxable Income", naira(employmentTotal + bizProfit + investment)),
      taxLine("Less: Eligible Pension Contribution", eligiblePension),
      taxLine("Less: Applicable Reliefs/Deductions", reliefs.applicableReliefs),
      taxLine("Less: Other Eligible Tax Savings", 0),
      taxLine("Less: Capital Allowance, where applicable", capitalAllowance),
      taxLine("Chargeable Income", chargeable),
      taxLine("PIT Liability", pit),
      taxLine("Less: WHT Tax Credits", wht),
      taxLine("Less: PAYE/Tax Already Paid/Credited", paye),
      taxLine("Less: Other Tax Credits", 0),
      taxLine("Net PIT Payable/(Refundable)", net),
    ],
  };
}
