import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export async function getVatSummary(companyId: string, linkedUserId?: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });
  if (!company) return null;

  if (linkedUserId) {
    const computations = await prisma.enterpriseVatComputation.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    const monthly = await prisma.enterpriseVatMonthly.findMany({
      where: { companyId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 12,
    });
    const totalVatPayable = monthly.reduce(
      (s, m) => s + decimalToNumber(m.vatPayable),
      0,
    );
    return {
      totalVatPayable,
      lastComputation: computations[0]
        ? {
            id: computations[0].id,
            period: `${computations[0].startDate.toISOString().slice(0, 7)} - ${computations[0].endDate.toISOString().slice(0, 7)}`,
            netVatPayable: decimalToNumber(computations[0].netVatPayable),
            status: computations[0].status,
          }
        : null,
      monthlyBreakdown: monthly.map((m) => ({
        month: m.month,
        year: m.year,
        vatPayable: decimalToNumber(m.vatPayable),
      })),
    };
  }

  const computations = await prisma.enterpriseVatComputation.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const monthly = await prisma.enterpriseVatMonthly.findMany({
    where: { companyId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 12,
  });
  const totalVatPayable = monthly.reduce(
    (s, m) => s + decimalToNumber(m.vatPayable),
    0,
  );
  return {
    totalVatPayable,
    lastComputation: computations[0]
      ? {
          id: computations[0].id,
          period: `${computations[0].startDate.toISOString().slice(0, 7)} - ${computations[0].endDate.toISOString().slice(0, 7)}`,
          netVatPayable: decimalToNumber(computations[0].netVatPayable),
          status: computations[0].status,
        }
      : null,
    monthlyBreakdown: monthly.map((m) => ({
      month: m.month,
      year: m.year,
      vatPayable: decimalToNumber(m.vatPayable),
    })),
  };
}
