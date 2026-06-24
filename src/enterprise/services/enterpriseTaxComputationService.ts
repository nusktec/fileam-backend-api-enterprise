import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  PERCENT,
  WHT_RATE_SERVICES_PERCENT,
  CIT_RATE_STANDARD_PERCENT,
} from "../../constants/percentages";
import { estimateAnnualPersonalIncomeTaxNg } from "../../constants/pitComputation";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

const VAT_TYPES = ["Standard Rate", "Reduced Rate", "Zero Rate", "Exempt"];
const VAT_PERIODS = ["Monthly", "Quarterly", "Annual"];
const VAT_THRESHOLD_DEFAULT = 100000;
const VAT_TURNOVER_THRESHOLD = 25_000_000;
const BELOW_THRESHOLD_MESSAGE =
  "This business turnover in the last 12 months is below N25,000,000. VAT registration is not currently required. We will monitor the turnover and alert you if VAT registration becomes necessary in the future.";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export const enterpriseTaxComputationService = {
  getVatTypes: () => VAT_TYPES,
  getVatPeriods: () => VAT_PERIODS,

  async getVatStatus(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const count = await prisma.enterpriseVatComputation.count({
      where: { companyId },
    });
    return { hasVatData: count > 0 };
  },

  async initiateVatSetup(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    await prisma.enterpriseThresholdStatus.upsert({
      where: { companyId },
      create: {
        companyId,
        status: "below",
        message: "Your monthly VAT liability is currently below the threshold.",
      },
      update: {},
    });
    return { initiated: true };
  },

  async calculateVat(
    companyId: string,
    data: {
      vatType: string;
      vatPeriod: string;
      startDate: Date;
      endDate: Date;
      salesAmountExclVat: number;
      purchaseAmountExclVat: number;
      vatRate: number;
    },
    linkedUserId?: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;

    let salesAmountExclVat = data.salesAmountExclVat;
    let purchaseAmountExclVat = data.purchaseAmountExclVat;
    if (linkedUserId && (salesAmountExclVat === 0 || purchaseAmountExclVat === 0)) {
      const [sales, expenses] = await Promise.all([
        prisma.sale.aggregate({
          where: {
            userId: linkedUserId,
            saleDate: { gte: data.startDate, lte: data.endDate },
          },
          _sum: { totalAmount: true },
        }),
        prisma.expense.aggregate({
          where: {
            userId: linkedUserId,
            expenseDate: { gte: data.startDate, lte: data.endDate },
          },
          _sum: { totalAmount: true },
        }),
      ]);
      if (salesAmountExclVat === 0) salesAmountExclVat = decimalToNumber(sales._sum.totalAmount);
      if (purchaseAmountExclVat === 0) purchaseAmountExclVat = decimalToNumber(expenses._sum.totalAmount);
    }

    const rate = data.vatRate / PERCENT;
    const salesVat = salesAmountExclVat * rate;
    const purchaseVat = purchaseAmountExclVat * rate;
    const netVatPayable = salesVat - purchaseVat;
    const computation = await prisma.enterpriseVatComputation.create({
      data: {
        companyId,
        vatType: data.vatType,
        vatPeriod: data.vatPeriod,
        startDate: data.startDate,
        endDate: data.endDate,
        salesAmountExclVat: new Decimal(salesAmountExclVat),
        purchaseAmountExclVat: new Decimal(purchaseAmountExclVat),
        vatRate: new Decimal(data.vatRate),
        salesVat: new Decimal(salesVat),
        purchaseVat: new Decimal(purchaseVat),
        netVatPayable: new Decimal(netVatPayable),
        status: "draft",
      },
    });
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      await prisma.enterpriseVatMonthly.upsert({
        where: {
          companyId_year_month: { companyId, year, month },
        },
        create: {
          companyId,
          year,
          month,
          vatPayable: new Decimal(netVatPayable / 3),
        },
        update: {
          vatPayable: new Decimal(netVatPayable / 3),
        },
      });
    }
    return {
      id: computation.id,
      salesVat: normalizeMoneyAmount(salesVat),
      purchaseVat: normalizeMoneyAmount(purchaseVat),
      netVatPayable: normalizeMoneyAmount(netVatPayable),
      computation,
    };
  },

  async getVatResults(companyId: string, computationId?: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    if (computationId) {
      const c = await prisma.enterpriseVatComputation.findFirst({
        where: { id: computationId, companyId },
      });
      if (!c) return null;
      return {
        salesVat: normalizeMoneyAmount(decimalToNumber(c.salesVat)),
        purchaseVat: normalizeMoneyAmount(decimalToNumber(c.purchaseVat)),
        netVatPayable: normalizeMoneyAmount(decimalToNumber(c.netVatPayable)),
        computation: c,
      };
    }
    const latest = await prisma.enterpriseVatComputation.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) return null;
    return {
      salesVat: normalizeMoneyAmount(decimalToNumber(latest.salesVat)),
      purchaseVat: normalizeMoneyAmount(decimalToNumber(latest.purchaseVat)),
      netVatPayable: normalizeMoneyAmount(decimalToNumber(latest.netVatPayable)),
      computation: latest,
    };
  },

  async submitVatReturn(companyId: string, computationId: string) {
    const c = await prisma.enterpriseVatComputation.findFirst({
      where: { id: computationId, companyId },
    });
    if (!c) return null;
    await prisma.enterpriseVatComputation.update({
      where: { id: c.id },
      data: { status: "submitted", submittedAt: new Date() },
    });
    return prisma.enterpriseVatComputation.findUnique({ where: { id: c.id } });
  },

  async getMonthlyVatPayable(companyId: string, year?: number) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const y = year ?? new Date().getFullYear();
    const rows = await prisma.enterpriseVatMonthly.findMany({
      where: { companyId, year: y },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    return rows.map((r) => ({
      month: r.month,
      year: r.year,
      vatPayable: normalizeMoneyAmount(decimalToNumber(r.vatPayable)),
    }));
  },

  async getThresholdStatus(companyId: string, linkedUserId?: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    let status = await prisma.enterpriseThresholdStatus.findUnique({
      where: { companyId },
    });
    const message =
      status?.status === "below"
        ? BELOW_THRESHOLD_MESSAGE
        : status?.message ?? "VAT registration may be required.";
    if (!status) {
      status = await prisma.enterpriseThresholdStatus.create({
        data: {
          companyId,
          status: "below",
          message: BELOW_THRESHOLD_MESSAGE,
        },
      });
    }
    return {
      ...status,
      message,
      belowThreshold: status.status === "below",
      turnoverThreshold: VAT_TURNOVER_THRESHOLD,
    };
  },

  async getThresholdInfo() {
    return {
      thresholdAmount: VAT_TURNOVER_THRESHOLD,
      description: "Learn more about VAT thresholds.",
      link: "#",
    };
  },

  async getTaxComputationChart(companyId: string, linkedUserId?: string) {
    const stats = await this.getVatFiling12MonthStats(companyId, linkedUserId);
    if (!stats) return null;
    const months = "months" in stats ? stats.months : [];
    const totalTurnOver =
      "totalIncome" in stats
        ? (stats as { totalIncome: number }).totalIncome
        : (months as Array<{ netCashFlow?: number; vatPayable?: number }>).reduce(
            (s, m) => s + (m.netCashFlow ?? m.vatPayable ?? 0),
            0,
          );
    const chartSet = (months as Array<{ month: number; year: number; netCashFlow?: number; vatPayable?: number }>).map(
      (m) => ({
        month: m.month,
        year: m.year,
        label: `${new Date(m.year, m.month - 1).toLocaleString("default", { month: "short" })} ${m.year}`,
        amount: m.netCashFlow ?? m.vatPayable ?? 0,
      }),
    );
    const thresholdStatus = await this.getThresholdStatus(companyId, linkedUserId);
    const status =
      thresholdStatus?.status === "below"
        ? "This business is not required to charge for VAT"
        : "VAT registration required";
    const turnoverStatement =
      totalTurnOver < VAT_TURNOVER_THRESHOLD
        ? `Turnover (N${totalTurnOver.toLocaleString()}) is below N25,000,000 threshold`
        : `Turnover (N${totalTurnOver.toLocaleString()}) is above N25,000,000 threshold`;
    return {
      totalTurnOver,
      chartSet,
      status,
      turnoverStatement,
    };
  },

  async getTaxAssumptions(companyId: string, linkedUserId?: string) {
    const [thresholdStatus, business] = await Promise.all([
      this.getThresholdStatus(companyId, linkedUserId),
      linkedUserId
        ? prisma.business.findFirst({ where: { userId: linkedUserId } })
        : null,
    ]);
    const vatStatus = (business?.vatStatus ?? thresholdStatus?.status ?? "below").toLowerCase();
    return {
      vatRegistrationStatus: vatStatus === "registered" ? "Registered" : "Unregistered",
      applicationCitRate: 30,
      msmeExemptionEligible: "No" as const,
      pioneerTaxStatus: "Not Applicable" as const,
    };
  },

  async getVatFiling12MonthStats(
    companyId: string,
    linkedUserId?: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;

    if (linkedUserId) {
      const { getClientMonthlyCashFlow } = await import("./clientDataHelper");
      const now = new Date();
      const year = now.getFullYear();
      const flow = await getClientMonthlyCashFlow(linkedUserId, year);
      const prevYear = await getClientMonthlyCashFlow(linkedUserId, year - 1);
      const all = [...prevYear, ...flow].sort(
        (a, b) => (a.year - b.year) * 12 + (a.month - b.month),
      );
      const last12 = all.slice(-12);
      return {
        months: last12.map((m) => ({
          month: m.month,
          year: m.year,
          netCashFlow: m.value,
        })),
        totalIncome: last12.reduce((s, m) => s + Math.max(0, m.value), 0),
        totalExpenses: last12.reduce((s, m) => s + Math.abs(Math.min(0, m.value)), 0),
      };
    }

    const y = new Date().getFullYear();
    const rows = await prisma.enterpriseVatMonthly.findMany({
      where: { companyId, year: { gte: y - 1 } },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    const last12 = rows.slice(-12);
    return {
      months: last12.map((r) => ({
        month: r.month,
        year: r.year,
        vatPayable: decimalToNumber(r.vatPayable),
      })),
    };
  },

  async getTaxBreakdown(companyId: string, linkedUserId?: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;

    const taxConfig = await prisma.clientTaxConfiguration.findUnique({
      where: { companyId },
    });

    const result: {
      totalIncome: number;
      totalExpenses: number;
      netProfit: number;
      vat?: {
        enabled: boolean;
        outputVat: number;
        inputVatClaimable: number;
        netVatPayable: number;
        belowThreshold?: boolean;
      };
      paye?: {
        enabled: boolean;
        amount: number;
        dueDate?: Date;
        note?: string;
      };
      wht?: {
        enabled: boolean;
        serviceIncome: number;
        estimatedWhtDeducted: number;
        whtRate: number;
      };
      cit?: {
        enabled: boolean;
        taxableProfit: number;
        citRate: number;
        citPayable: number;
      };
      pit?: {
        enabled: boolean;
        chargeableIncomeProxyAnnual: number;
        pitPayableAnnual: number;
        methodology: string;
      };
      stampDuties?: {
        enabled: boolean;
        amount: number;
        note: string;
      };
    } = {
      totalIncome: 0,
      totalExpenses: 0,
      netProfit: 0,
    };

    if (linkedUserId) {
      const now = new Date();
      const { getClientFinancialSummary } = await import("./clientDataHelper");
      const summary = await getClientFinancialSummary(linkedUserId);
      result.totalIncome = summary.totalIncome;
      result.totalExpenses = summary.totalExpenses;
      result.netProfit = summary.netProfit;

      const { taxComputationService } = await import("../../mobile/services/taxComputationService");
      const comp = await taxComputationService.getForPeriod(
        linkedUserId,
        now.getFullYear(),
        now.getMonth() + 1,
      );

      if (taxConfig?.vat ?? true) {
        result.vat = {
          enabled: true,
          outputVat: comp.vat.outputVat,
          inputVatClaimable: comp.vat.inputVatClaimable,
          netVatPayable: comp.vat.netVatPayable,
          belowThreshold: comp.vat.belowThreshold,
        };
      }

      if (taxConfig?.paye ?? false) {
        const { employeesService } = await import("../../mobile/services/employeesService");
        const obligations = await employeesService.getObligations(linkedUserId);
        result.paye = {
          enabled: true,
          amount: obligations.paye.amount,
          dueDate: obligations.paye.dueDate,
          note: obligations.paye.note,
        };
      }

      if (taxConfig?.wht ?? true) {
        result.wht = {
          enabled: true,
          serviceIncome: comp.wht.serviceIncome,
          estimatedWhtDeducted: comp.wht.estimatedWhtDeducted,
          whtRate: comp.wht.whtRateServices,
        };
      }

      if (taxConfig?.cit ?? true) {
        const taxableProfit = Math.max(0, summary.netProfit);
        const citRate = comp.cit.citRate;
        result.cit = {
          enabled: true,
          taxableProfit,
          citRate,
          citPayable: (taxableProfit * 12 * citRate) / PERCENT,
        };
      }

      if (taxConfig?.pit ?? false) {
        const chargeableAnnual = Math.max(0, summary.netProfit * 12);
        const pit = estimateAnnualPersonalIncomeTaxNg(chargeableAnnual);
        result.pit = {
          enabled: true,
          chargeableIncomeProxyAnnual: chargeableAnnual,
          pitPayableAnnual: pit.estimatedAnnualPitNgn,
          methodology: pit.methodology,
        };
      }

      if (taxConfig?.stampDuties ?? false) {
        result.stampDuties = {
          enabled: true,
          amount: 0,
          note: "Stamp duties computed per transaction/document. No aggregate data available.",
        };
      }
    } else {
      const { enterpriseFinancialsService } = await import("./enterpriseFinancialsService");
      const summary = await enterpriseFinancialsService.getSummary(companyId);
      if (!summary) return null;
      result.totalIncome = summary.totalIncome;
      result.totalExpenses = summary.totalExpenses;
      result.netProfit = summary.netProfit;

      const latestVat = await prisma.enterpriseVatComputation.findFirst({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });

      if ((taxConfig?.vat ?? true) && latestVat) {
        result.vat = {
          enabled: true,
          outputVat: decimalToNumber(latestVat.salesVat),
          inputVatClaimable: decimalToNumber(latestVat.purchaseVat),
          netVatPayable: decimalToNumber(latestVat.netVatPayable),
        };
      }

      if (taxConfig?.paye ?? false) {
        result.paye = {
          enabled: true,
          amount: 0,
          note: "PAYE requires employee data. Add employees to compute.",
        };
      }

      if (taxConfig?.wht ?? true) {
        result.wht = {
          enabled: true,
          serviceIncome: 0,
          estimatedWhtDeducted: 0,
          whtRate: WHT_RATE_SERVICES_PERCENT,
        };
      }

      if (taxConfig?.cit ?? true) {
        const taxableProfit = Math.max(0, summary.netProfit);
        const citRate = CIT_RATE_STANDARD_PERCENT;
        result.cit = {
          enabled: true,
          taxableProfit,
          citRate,
          citPayable: taxableProfit * (citRate / PERCENT),
        };
      }

      if (taxConfig?.pit ?? false) {
        const chargeableAnnual = Math.max(0, summary.netProfit * 12);
        const pit = estimateAnnualPersonalIncomeTaxNg(chargeableAnnual);
        result.pit = {
          enabled: true,
          chargeableIncomeProxyAnnual: chargeableAnnual,
          pitPayableAnnual: pit.estimatedAnnualPitNgn,
          methodology: pit.methodology,
        };
      }

      if (taxConfig?.stampDuties ?? false) {
        result.stampDuties = {
          enabled: true,
          amount: 0,
          note: "Stamp duties computed per transaction/document. No aggregate data available.",
        };
      }
    }

    return result;
  },

  async getVatComputation(
    companyId: string,
    year?: number,
    month?: number,
    linkedUserId?: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;

    if (linkedUserId) {
      const { taxComputationService } = await import("../../mobile/services/taxComputationService");
      const comp = await taxComputationService.getForPeriod(linkedUserId, y, m);
      return {
        period: comp.period,
        outputVat: comp.vat.outputVat,
        inputVatClaimable: comp.vat.inputVatClaimable,
        netVatPayable: comp.vat.netVatPayable,
        belowThreshold: comp.vat.belowThreshold,
        income: comp.vat.income,
        vatThreshold: comp.vat.vatThreshold,
      };
    }

    const latest = await prisma.enterpriseVatComputation.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) return null;
    return {
      period: { year: y, month: m, label: `${new Date(y, m - 1).toLocaleString("default", { month: "long" })} ${y}` },
      outputVat: normalizeMoneyAmount(decimalToNumber(latest.salesVat)),
      inputVatClaimable: normalizeMoneyAmount(decimalToNumber(latest.purchaseVat)),
      netVatPayable: normalizeMoneyAmount(decimalToNumber(latest.netVatPayable)),
    };
  },

  async getPayeComputation(companyId: string, linkedUserId?: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    if (!linkedUserId) {
      return {
        amount: 0,
        dueDate: null,
        note: "PAYE requires employee data. Add employees to compute.",
      };
    }
    const { employeesService } = await import("../../mobile/services/employeesService");
    const obligations = await employeesService.getObligations(linkedUserId);
    return {
      amount: obligations.paye.amount,
      dueDate: obligations.paye.dueDate,
      note: obligations.paye.note,
      pension: obligations.pension,
    };
  },

  async getWhtComputation(
    companyId: string,
    year?: number,
    month?: number,
    linkedUserId?: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;

    if (linkedUserId) {
      const { taxComputationService } = await import("../../mobile/services/taxComputationService");
      const comp = await taxComputationService.getForPeriod(linkedUserId, y, m);
      return {
        period: comp.period,
        serviceIncome: comp.wht.serviceIncome,
        whtRate: comp.wht.whtRateServices,
        estimatedWhtDeducted: comp.wht.estimatedWhtDeducted,
      };
    }

    return {
      period: { year: y, month: m, label: `${new Date(y, m - 1).toLocaleString("default", { month: "long" })} ${y}` },
      serviceIncome: 0,
      whtRate: WHT_RATE_SERVICES_PERCENT,
      estimatedWhtDeducted: 0,
      note: "WHT requires sales/expense data. Add transactions to compute.",
    };
  },

  async getCitComputation(
    companyId: string,
    year?: number,
    month?: number,
    linkedUserId?: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;

    if (linkedUserId) {
      const { taxComputationService } = await import("../../mobile/services/taxComputationService");
      const { getClientFinancialSummary } = await import("./clientDataHelper");
      const comp = await taxComputationService.getForPeriod(linkedUserId, y, m);
      const summary = await getClientFinancialSummary(linkedUserId);
      const taxableProfit = Math.max(0, summary.netProfit);
      return {
        period: comp.period,
        monthlyProfit: comp.cit.monthlyProfit,
        annualizedProfit: comp.cit.annualizedProfit,
        taxableProfit,
        citRate: comp.cit.citRate,
        estimatedAnnualCit: comp.cit.estimatedAnnualCit,
        citThreshold: comp.cit.citThreshold,
        percentOfThreshold: comp.cit.percentOfThreshold,
      };
    }

    const { enterpriseFinancialsService } = await import("./enterpriseFinancialsService");
    const summary = await enterpriseFinancialsService.getSummary(companyId);
    if (!summary) return null;
    const taxableProfit = Math.max(0, summary.netProfit);
    const citRate = CIT_RATE_STANDARD_PERCENT;
    return {
      period: { year: y, month: m, label: `${new Date(y, m - 1).toLocaleString("default", { month: "long" })} ${y}` },
      monthlyProfit: summary.netProfit,
      annualizedProfit: summary.netProfit * 12,
      taxableProfit,
      citRate,
      estimatedAnnualCit: taxableProfit * (citRate / PERCENT),
    };
  },

  async getPitComputation(
    companyId: string,
    year?: number,
    month?: number,
    linkedUserId?: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;

    if (linkedUserId) {
      const { taxComputationService } = await import("../../mobile/services/taxComputationService");
      const comp = await taxComputationService.getForPeriod(linkedUserId, y, m);
      return {
        period: comp.period,
        monthlyProfit: comp.pit.monthlyProfit,
        annualizedProfit: comp.pit.annualizedProfit,
        chargeableIncomeProxyAnnual: comp.pit.chargeableIncomeProxyAnnual,
        estimatedAnnualPit: comp.pit.estimatedAnnualPit,
        methodology: comp.pit.methodology,
      };
    }

    const { enterpriseFinancialsService } = await import("./enterpriseFinancialsService");
    const summary = await enterpriseFinancialsService.getSummary(companyId);
    if (!summary) return null;
    const chargeableAnnual = Math.max(0, summary.netProfit * 12);
    const pit = estimateAnnualPersonalIncomeTaxNg(chargeableAnnual);
    return {
      period: { year: y, month: m, label: `${new Date(y, m - 1).toLocaleString("default", { month: "long" })} ${y}` },
      monthlyProfit: summary.netProfit,
      annualizedProfit: summary.netProfit * 12,
      chargeableIncomeProxyAnnual: chargeableAnnual,
      estimatedAnnualPit: pit.estimatedAnnualPitNgn,
      methodology: pit.methodology,
    };
  },

  async getStampDutiesComputation(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    return {
      amount: 0,
      note: "Stamp duties are computed per transaction or document. No aggregate computation available. Submit individual documents for stamping.",
    };
  },
};
