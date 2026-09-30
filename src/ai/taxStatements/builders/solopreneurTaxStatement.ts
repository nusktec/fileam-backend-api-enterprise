import {
  classifySmallCompany,
  CIT_DEVELOPMENT_LEVY_RATE,
  roundCitNaira,
} from "../../../constants/citFiling";
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
  liveReceivables,
  type TaxStatementContext,
} from "../taxStatementSources";
import { payerWhtCredit } from "../employerYear";
import type { TaxStatementResult } from "../taxStatementTypes";

function saleMap(category: string | null): {
  bucket:
    | "sales"
    | "service"
    | "consult"
    | "commission"
    | "rentalOp"
    | "other"
    | "interest"
    | "skip";
} {
  const c = catKey(category);
  if (c === "product sales") return { bucket: "sales" };
  if (c === "service revenue" || c === "service income") return { bucket: "service" };
  if (c === "consulting fees" || c === "consulting") return { bucket: "consult" };
  if (c === "commission income") return { bucket: "commission" };
  if (
    c === "subscription revenue" ||
    c === "subscription" ||
    c === "delivery charges" ||
    c === "rental income" ||
    !c
  ) {
    return { bucket: "rentalOp" };
  }
  if (c === "interest income") return { bucket: "interest" };
  if (c === "gift" || c === "subsidies" || c === "grant" || c === "other income" || c === "other") {
    return { bucket: "other" };
  }
  return { bucket: "rentalOp" };
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
    const sale = ctx.assetSales.find(
      (d) =>
        (d.assetId === asset.id || d.assetId === asset.assetCode) &&
        !isUndoneStatus(d.status),
    );
    const exitCandidates = [disposal?.disposalDate, sale?.saleDate].filter(
      Boolean,
    ) as string[];
    const exitYmd = exitCandidates.sort()[0] ?? null;
    if (exitYmd && exitYmd < period.periodStart) continue;
    const held = monthsHeldInPeriod({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      purchaseYmd: purchase,
      exitYmd,
    });
    const charge = naira((asset.annualDepreciation * held) / 12);
    if (asset.assetType === "SOFTWARE_LICENSES") amort += charge;
    else dep += charge;
  }
  return { dep: naira(dep), amort: naira(amort) };
}

export function buildSolopreneurTaxStatement(
  ctx: TaxStatementContext,
): TaxStatementResult {
  const { period } = ctx;
  const legalStructure = ctx.solopreneurRegistration;
  const liabilityTax: "PIT" | "CIT" =
    String(legalStructure ?? "").toUpperCase() === "LIMITED_COMPANY"
      ? "CIT"
      : "PIT";

  let salesRev = ctx.orphanInventorySales;
  let serviceRev = 0;
  let consultRev = 0;
  let commissionRev = 0;
  let rentalOp = 0;
  let investment = 0;
  let interest = 0;
  let otherInc = 0;
  let dividendSubtotal = 0;
  let wht = 0;

  for (const sale of ctx.sales) {
    const { bucket } = saleMap(sale.category);
    if (bucket === "sales") salesRev += sale.amount;
    else if (bucket === "service") serviceRev += sale.amount;
    else if (bucket === "consult") consultRev += sale.amount;
    else if (bucket === "commission") commissionRev += sale.amount;
    else if (bucket === "rentalOp") rentalOp += sale.amount;
    else if (bucket === "interest") interest += sale.amount;
    else if (bucket === "other") otherInc += sale.amount;
  }

  if (!ctx.payerFeesIncludedInSales) {
    for (const tx of ctx.payerTxs) {
      const cat = catKey(tx.category);
      const purpose = catKey(tx.purpose);
      const credit =
        tx.whtApplicable &&
        !(liabilityTax === "PIT" && (cat === "interest_income" || cat === "dividend_income"));
      const addWht = () => {
        if (credit) wht += payerWhtCredit(tx.amount, tx.whtRate);
      };
      if (cat === "sale_of_goods") {
        salesRev += tx.amount;
        addWht();
      } else if (cat === "provision_of_services" || cat === "contract_project") {
        serviceRev += tx.amount;
        addWht();
      } else if (cat === "professional_consultancy") {
        consultRev += tx.amount;
        addWht();
      } else if (cat === "commission_brokerage") {
        commissionRev += tx.amount;
        addWht();
      } else if (cat === "rent_lease") {
        rentalOp += tx.amount;
        addWht();
      } else if (cat === "other_business") {
        otherInc += tx.amount;
        addWht();
      } else if (cat === "interest_income") {
        interest += tx.amount;
        if (liabilityTax === "CIT") addWht();
      } else if (cat === "dividend_income") {
        investment += tx.amount;
        dividendSubtotal += tx.amount;
        if (liabilityTax === "CIT") addWht();
      } else if (purpose === "investment_income") {
        investment += tx.amount;
        addWht();
      }
    }
  }

  for (const rec of liveReceivables(ctx.receivables, period)) {
    if (rec.incomeType === "INTEREST") {
      interest += rec.incomeAmount;
      if (liabilityTax === "CIT") wht += rec.whtDeducted;
    } else if (rec.incomeType === "DIVIDEND") {
      investment += rec.incomeAmount;
      dividendSubtotal += rec.incomeAmount;
      if (liabilityTax === "CIT") wht += rec.whtDeducted;
    } else if (rec.incomeType === "OTHER_INVESTMENT_INCOME") {
      investment += rec.incomeAmount;
      wht += rec.whtDeducted;
    }
  }

  let gain = 0;
  for (const s of ctx.assetSales) {
    if (isUndoneStatus(s.status)) continue;
    if (s.saleDate < period.periodStart || s.saleDate > period.periodEnd) continue;
    if (s.gainLossType === "GAIN") gain += s.gainLossAmount;
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
  const directMaterials = ctx.expenses
    .filter((e) => !isSkippedOperatingExpense(e.category, e.expenseType))
    .filter((e) => catKey(e.category) === "production materials")
    .reduce((s, e) => s + e.amount, 0);
  const otherDirect = ctx.expenses
    .filter((e) => !isSkippedOperatingExpense(e.category, e.expenseType))
    .filter((e) => {
      const k = catKey(e.category);
      return k === "packaging" || k === "direct service costs";
    })
    .reduce((s, e) => s + e.amount, 0);

  let salaries = ctx.payrollTotal;
  if (salaries === 0) {
    salaries = ctx.expenses
      .filter((e) => !isSkippedOperatingExpense(e.category, e.expenseType))
      .filter((e) => catKey(e.category) === "salaries" || catKey(e.category) === "salary")
      .reduce((s, e) => s + e.amount, 0);
  }

  let rent = 0;
  let utilities = 0;
  let marketing = 0;
  let professional = 0;
  let consultancy = 0;
  let software = 0;
  let insurance = 0;
  let communication = 0;
  let office = 0;
  let otherOpEx = 0;
  let bankCharges = 0;
  let repairs = 0;

  for (const e of ctx.expenses) {
    if (isSkippedOperatingExpense(e.category, e.expenseType)) continue;
    const k = catKey(e.category);
    if (ctx.payrollTotal > 0 && (k === "salaries" || k === "salary")) continue;
    if (k === "office rent") rent += e.amount;
    else if (k === "electricity" || k === "waste collection") utilities += e.amount;
    else if (k === "marketing") marketing += e.amount;
    else if (k === "accounting fees" || k === "legal fees") professional += e.amount;
    else if (k === "project contractors") consultancy += e.amount;
    else if (k === "tools & software") software += e.amount;
    else if (k === "insurance") insurance += e.amount;
    else if (k === "internet" || k === "airtime") communication += e.amount;
    else if (k === "office supplies") office += e.amount;
    else if (k === "bank charges") bankCharges += e.amount;
    else if (
      k === "freight & logistics" ||
      k === "delivery costs" ||
      k === "production materials" ||
      k === "packaging" ||
      k === "direct service costs" ||
      k === "inventory purchases"
    ) {
      continue;
    } else otherOpEx += e.amount;
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
  const totalRevenue = naira(
    salesRev + serviceRev + consultRev + commissionRev + rentalOp,
  );
  const costOfSales = naira(
    opening + purchases + directMaterials + 0 + freight + otherDirect - closing,
  );
  const grossProfit = naira(totalRevenue - costOfSales);
  const totalOpEx = naira(
    salaries +
      ctx.employerPensionShare +
      rent +
      utilities +
      0 +
      repairs +
      marketing +
      professional +
      consultancy +
      software +
      insurance +
      communication +
      office +
      dep +
      amort +
      0 +
      otherOpEx,
  );
  const operatingProfit = naira(grossProfit - totalOpEx);
  const tradeProfit = naira(operatingProfit - ctx.loanInterest - bankCharges - 0);
  const accountingProfit = naira(
    tradeProfit + investment + interest + gain + otherInc,
  );

  const taxPbt =
    liabilityTax === "CIT"
      ? accountingProfit
      : naira(accountingProfit - interest - dividendSubtotal);

  const use = resolveCapitalAllowanceUse({
    taxPersona: "SOLOPRENEUR",
    solopreneurRegistration: ctx.solopreneurRegistration,
  });
  let capitalAllowance = 0;
  if (use.tax === liabilityTax) {
    const capBase = liabilityTax === "PIT" ? tradeProfit : taxPbt;
    capitalAllowance = Math.min(
      ctx.capitalAllowanceAvailable,
      Math.max(0, capBase),
    );
  }

  const reliefs = pitReliefsFromDraft(ctx.pitDraft, period);
  const applicable =
    liabilityTax === "CIT"
      ? 0
      : naira(
          (reliefs.pensionOverride != null
            ? reliefs.pensionOverride
            : reliefs.extraPension) + reliefs.applicableReliefs,
        );

  const chargeable = Math.max(
    0,
    taxPbt - naira(capitalAllowance) - applicable - 0,
  );

  let liability = 0;
  let citAmount = 0;
  let developmentLevy = 0;
  if (liabilityTax === "PIT") {
    liability = statementFourthScheduleTax(chargeable);
  } else {
    let fixedAssets = 0;
    for (const asset of ctx.assets) {
      const purchase = asset.purchaseDate;
      if (purchase && purchase > period.periodEnd) continue;
      const soldBefore = ctx.assetSales.some(
        (s) =>
          (s.assetId === asset.id || s.assetId === asset.assetCode) &&
          !isUndoneStatus(s.status) &&
          s.saleDate < period.periodStart,
      );
      const disposedBefore = ctx.assetDisposals.some(
        (s) =>
          (s.assetId === asset.id || s.assetId === asset.assetCode) &&
          !isUndoneStatus(s.status) &&
          s.disposalDate < period.periodStart,
      );
      if (soldBefore || disposedBefore) continue;
      fixedAssets += asset.purchaseCost;
    }
    const classification = classifySmallCompany({
      turnover: Math.max(0, totalRevenue),
      fixedAssets,
      providesProfessionalServices: ctx.professionalService,
    });
    citAmount = roundCitNaira(
      chargeable * (classification.citRate / 100),
    );
    developmentLevy = classification.isSmallCompany
      ? 0
      : roundCitNaira(Math.max(0, taxPbt) * CIT_DEVELOPMENT_LEVY_RATE);
    liability = naira(citAmount + developmentLevy);
  }

  const net =
    liabilityTax === "PIT"
      ? naira(liability - wht)
      : naira(citAmount - Math.min(wht, citAmount) + developmentLevy);

  return {
    incomeType: "SOLOPRENEUR",
    year: period.year,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    currency: "NGN",
    legalStructure,
    liabilityTax,
    profitAndLoss: [
      plLine("Revenue", "Sales Revenue", salesRev),
      plLine("Revenue", "Service Revenue", serviceRev),
      plLine("Revenue", "Consultancy/Professional Income", consultRev),
      plLine("Revenue", "Commission Income", commissionRev),
      plLine("Revenue", "Rental/Other Operating Income", rentalOp),
      plLine("Revenue", "Total Revenue", totalRevenue),
      plLine("Cost of Sales", "Opening Inventory", opening),
      plLine("Cost of Sales", "Purchases", purchases),
      plLine("Cost of Sales", "Direct Materials", directMaterials),
      plLine("Cost of Sales", "Direct Labour", 0),
      plLine("Cost of Sales", "Freight/Import Costs", freight),
      plLine("Cost of Sales", "Other Direct Costs", otherDirect),
      plLine("Cost of Sales", "Less: Closing Inventory", closing),
      plLine("Cost of Sales", "Cost of Sales", costOfSales),
      plLine("Cost of Sales", "Gross Profit", grossProfit),
      plLine("Operating Expenses", "Salaries & Wages", salaries),
      plLine("Operating Expenses", "Employer Pension", ctx.employerPensionShare),
      plLine("Operating Expenses", "Rent", rent),
      plLine("Operating Expenses", "Utilities", utilities),
      plLine("Operating Expenses", "Transport & Travel", 0),
      plLine("Operating Expenses", "Repairs & Maintenance", repairs),
      plLine("Operating Expenses", "Marketing & Advertising", marketing),
      plLine("Operating Expenses", "Professional Fees", professional),
      plLine("Operating Expenses", "Consultancy", consultancy),
      plLine("Operating Expenses", "Software & Subscriptions", software),
      plLine("Operating Expenses", "Insurance", insurance),
      plLine("Operating Expenses", "Communication", communication),
      plLine("Operating Expenses", "Office Expenses", office),
      plLine("Operating Expenses", "Depreciation", dep),
      plLine("Operating Expenses", "Amortisation", amort),
      plLine("Operating Expenses", "Bad Debt", 0),
      plLine("Operating Expenses", "Other Operating Expenses", otherOpEx),
      plLine("Operating Expenses", "Total Operating Expenses", totalOpEx),
      plLine("Operating Expenses", "Operating Profit", operatingProfit),
      plLine("Finance Costs", "Loan Interest", ctx.loanInterest),
      plLine("Finance Costs", "Bank Charges", bankCharges),
      plLine("Finance Costs", "Other Finance Costs", 0),
      plLine("Finance Costs", "Profit Before Tax", tradeProfit),
      plLine("Other Income", "Investment Income", investment),
      plLine("Other Income", "Interest Income", interest),
      plLine("Other Income", "Gain on Asset Disposal", gain),
      plLine("Other Income", "Other Income", otherInc),
      plLine("Other Income", "Profit Before Tax", accountingProfit),
    ],
    taxComputation: [
      taxLine("Profit Before Tax", taxPbt),
      taxLine("Less: Capital Allowance", capitalAllowance),
      taxLine("Less: Applicable Tax Reliefs/Deductions", applicable),
      taxLine("Less: Other Eligible Tax Savings", 0),
      taxLine("Chargeable/Taxable Income", chargeable),
      taxLine("PIT/CIT Liability (based on legal structure)", liability),
      taxLine("Less: WHT Tax Credits", wht),
      taxLine("Less: Other Tax Credits", 0),
      taxLine("Less: Tax Already Paid/Credited", 0),
      taxLine("Net Tax Payable/(Refundable)", net),
    ],
  };
}
