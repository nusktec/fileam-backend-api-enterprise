import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";

const VAT_TYPES = ["Standard Rate", "Reduced Rate", "Zero Rate", "Exempt"];
const VAT_PERIODS = ["Monthly", "Quarterly", "Annual"];
const VAT_THRESHOLD_DEFAULT = 100000;

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export const enterpriseTaxComputationService = {
  getVatTypes: () => VAT_TYPES,
  getVatPeriods: () => VAT_PERIODS,

  async getVatStatus(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return null;
    const count = await prisma.enterpriseVatComputation.count({ where: { companyId } });
    return { hasVatData: count > 0 };
  },

  async initiateVatSetup(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return null;
    await prisma.enterpriseThresholdStatus.upsert({
      where: { companyId },
      create: { companyId, status: "below", message: "Your monthly VAT liability is currently below the threshold." },
      update: {},
    });
    return { initiated: true };
  },

  async calculateVat(companyId: string, data: {
    vatType: string;
    vatPeriod: string;
    startDate: Date;
    endDate: Date;
    salesAmountExclVat: number;
    purchaseAmountExclVat: number;
    vatRate: number;
  }) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return null;
    const rate = data.vatRate / 100;
    const salesVat = data.salesAmountExclVat * rate;
    const purchaseVat = data.purchaseAmountExclVat * rate;
    const netVatPayable = salesVat - purchaseVat;
    const computation = await prisma.enterpriseVatComputation.create({
      data: {
        companyId,
        vatType: data.vatType,
        vatPeriod: data.vatPeriod,
        startDate: data.startDate,
        endDate: data.endDate,
        salesAmountExclVat: new Decimal(data.salesAmountExclVat),
        purchaseAmountExclVat: new Decimal(data.purchaseAmountExclVat),
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
      salesVat,
      purchaseVat,
      netVatPayable,
      computation,
    };
  },

  async getVatResults(companyId: string, computationId?: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return null;
    if (computationId) {
      const c = await prisma.enterpriseVatComputation.findFirst({
        where: { id: computationId, companyId },
      });
      if (!c) return null;
      return {
        salesVat: decimalToNumber(c.salesVat),
        purchaseVat: decimalToNumber(c.purchaseVat),
        netVatPayable: decimalToNumber(c.netVatPayable),
        computation: c,
      };
    }
    const latest = await prisma.enterpriseVatComputation.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) return null;
    return {
      salesVat: decimalToNumber(latest.salesVat),
      purchaseVat: decimalToNumber(latest.purchaseVat),
      netVatPayable: decimalToNumber(latest.netVatPayable),
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
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return null;
    const y = year ?? new Date().getFullYear();
    const rows = await prisma.enterpriseVatMonthly.findMany({
      where: { companyId, year: y },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    return rows.map((r) => ({ month: r.month, year: r.year, vatPayable: decimalToNumber(r.vatPayable) }));
  },

  async getThresholdStatus(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return null;
    let status = await prisma.enterpriseThresholdStatus.findUnique({
      where: { companyId },
    });
    if (!status) {
      status = await prisma.enterpriseThresholdStatus.create({
        data: {
          companyId,
          status: "below",
          message: "Your monthly VAT liability is currently below the threshold.",
        },
      });
    }
    return status;
  },

  async getThresholdInfo() {
    return {
      thresholdAmount: VAT_THRESHOLD_DEFAULT,
      description: "Learn more about VAT thresholds.",
      link: "#",
    };
  },
};
