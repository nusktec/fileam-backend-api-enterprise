import { naira, plLine, splitByWeights, statementFourthScheduleTax, taxLine } from "../taxStatementMath";
import { pitReliefsFromDraft } from "../taxStatementReliefs";
import type { TaxStatementContext } from "../taxStatementSources";
import { liveReceivables } from "../taxStatementSources";
import {
  componentYearAmount,
  employerPayeCredit,
  employerWhtCredit,
  employerYearAmount,
  isMinWageEmploymentGross,
  periodGross,
  payerWhtCredit,
} from "../employerYear";
import type { TaxStatementResult } from "../taxStatementTypes";

export function buildPayeeTaxStatement(
  ctx: TaxStatementContext,
): TaxStatementResult {
  const { period } = ctx;
  let basic = 0;
  let housing = 0;
  let transport = 0;
  let otherEmp = 0;
  let oneOff = 0;
  let pension = 0;
  let whtCredits = 0;
  let payeCredits = 0;
  const includedYears = [];

  for (const emp of ctx.employers) {
    const year = employerYearAmount(emp, period);
    if (!year.included) continue;
    includedYears.push(year);
    const pg = periodGross(emp);
    if (year.oneOff) {
      const amt = year.hasHistory ? year.gross : naira(pg);
      oneOff += amt;
    } else if (year.hasHistory) {
      const [b, h, t, o] = splitByWeights(year.gross, [
        emp.basicSalary,
        emp.housingAllowance,
        emp.transportAllowance,
        emp.otherAllowances + emp.bonuses + emp.commissions,
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
        otherEmp += year.gross;
      } else {
        basic += b;
        housing += h;
        transport += t;
        otherEmp += o;
      }
    } else {
      basic += componentYearAmount(emp.basicSalary, emp, period, year);
      housing += componentYearAmount(emp.housingAllowance, emp, period, year);
      transport += componentYearAmount(emp.transportAllowance, emp, period, year);
      otherEmp += componentYearAmount(
        emp.otherAllowances + emp.bonuses + emp.commissions,
        emp,
        period,
        year,
      );
    }
    pension += year.pension;
    whtCredits += employerWhtCredit(year);
    payeCredits += employerPayeCredit(year);
  }

  const recs = liveReceivables(ctx.receivables, period);
  let investment = 0;
  let interest = 0;
  let dividend = 0;
  let otherTaxable = 0;

  for (const tx of ctx.payerTxs) {
    const cat = tx.category.trim().toLowerCase();
    const purpose = tx.purpose.trim().toLowerCase();
    if (cat === "interest_income") {
      interest += tx.amount;
      continue;
    }
    if (cat === "dividend_income") {
      dividend += tx.amount;
      continue;
    }
    if (purpose === "investment_income") {
      investment += tx.amount;
      if (tx.whtApplicable) whtCredits += payerWhtCredit(tx.amount, tx.whtRate);
      continue;
    }
    otherTaxable += tx.amount;
    if (tx.whtApplicable) whtCredits += payerWhtCredit(tx.amount, tx.whtRate);
  }

  for (const rec of recs) {
    if (rec.incomeType === "INTEREST") interest += rec.incomeAmount;
    else if (rec.incomeType === "DIVIDEND") dividend += rec.incomeAmount;
    else if (rec.incomeType === "OTHER_INVESTMENT_INCOME") {
      investment += rec.incomeAmount;
      whtCredits += rec.whtDeducted;
    }
  }

  const totalEmployment = naira(basic + housing + transport + otherEmp + oneOff);
  const totalOther = naira(investment + interest + dividend + otherTaxable);
  const totalIncome = naira(totalEmployment + totalOther);
  const taxOtherTaxable = naira(investment + otherTaxable);
  const grossTaxable = naira(totalEmployment + taxOtherTaxable);

  const reliefs = pitReliefsFromDraft(ctx.pitDraft, period);
  const statutoryPension =
    reliefs.pensionOverride != null
      ? naira(reliefs.pensionOverride)
      : naira(pension + reliefs.extraPension);

  const minWage =
    includedYears.length > 0 &&
    includedYears.every(
      (y) =>
        y.employer.relationship !== "CONTRACTOR" &&
        isMinWageEmploymentGross(y.gross),
    ) &&
    taxOtherTaxable === 0;

  let chargeable = Math.max(
    0,
    grossTaxable - statutoryPension - reliefs.applicableReliefs - 0,
  );
  let pit = statementFourthScheduleTax(chargeable);
  if (minWage) {
    chargeable = 0;
    pit = 0;
  }
  const net = naira(pit - whtCredits - payeCredits);

  return {
    incomeType: "PAYEE",
    year: period.year,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    currency: "NGN",
    incomeStatement: [
      plLine("Employment Income", "Basic Salary", basic),
      plLine("Employment Income", "Housing Allowance", housing),
      plLine("Employment Income", "Transport Allowance", transport),
      plLine("Employment Income", "Other Employment Income", otherEmp),
      plLine("Employment Income", "One-off Remuneration", oneOff),
      plLine("Employment Income", "Total Employment Income", totalEmployment),
      plLine("Other Income", "Investment Income", investment),
      plLine("Other Income", "Interest Income", interest),
      plLine("Other Income", "Dividend Income", dividend),
      plLine("Other Income", "Other Taxable Income", otherTaxable),
      plLine("Other Income", "Total Other Income", totalOther),
      plLine("Other Income", "Total Income", totalIncome),
    ],
    taxComputation: [
      taxLine("Total Employment Income", totalEmployment),
      taxLine("Other Taxable Income", taxOtherTaxable),
      taxLine("Gross Taxable Income", grossTaxable),
      taxLine("Less: Statutory Pension Contribution", statutoryPension),
      taxLine("Less: Applicable Tax Reliefs/Deductions", reliefs.applicableReliefs),
      taxLine("Less: Other Eligible Tax Savings", 0),
      taxLine("Chargeable Income", chargeable),
      taxLine("Applicable PIT", pit),
      taxLine("Less: WHT Tax Credits", whtCredits),
      taxLine("Less: Other Applicable Tax Credits", payeCredits),
      taxLine("Net PIT Payable/(Refundable)", net),
    ],
  };
}
