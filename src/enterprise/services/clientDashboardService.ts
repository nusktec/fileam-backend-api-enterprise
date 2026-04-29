import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { PERCENT } from "../../constants/percentages";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export async function getClientDashboard(linkedUserId: string) {
  const company = await prisma.company.findUnique({
    where: { linkedUserId },
    select: { id: true, ownerId: true },
  });
  const companyId = company?.id;

  const consultantConnectionPromise =
    company?.ownerId != null
      ? prisma.consultantConnection.findFirst({
          where: {
            consultantUserId: company.ownerId,
            userId: linkedUserId,
            status: "active",
          },
          select: { filingAuthorization: true },
        })
      : Promise.resolve(null);

  const [user, business, thresholdStatus, payables, taxConfig, consultantConnection] =
    await Promise.all([
    prisma.user.findUnique({
      where: { id: linkedUserId },
      select: { organizationName: true, firstName: true, lastName: true },
    }),
    prisma.business.findFirst({ where: { userId: linkedUserId } }),
    companyId
      ? prisma.enterpriseThresholdStatus.findUnique({
          where: { companyId },
        })
      : null,
    prisma.taxPayable.findMany({
      where: { userId: linkedUserId },
      include: { payments: { where: { status: "completed" } } },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    }),
    companyId
      ? prisma.clientTaxConfiguration.findUnique({
          where: { companyId },
        })
      : null,
    consultantConnectionPromise,
  ]);

  if (!user) return null;

  const businessName =
    business?.name ??
    user.organizationName ??
    (`${user.firstName} ${user.lastName}`.trim() || "Unknown");

  const vatRequired =
    thresholdStatus?.status === "above" ||
    (business?.vatStatus ?? "").toLowerCase() === "registered";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = today.getMonth() + 1;
  const thisYear = today.getFullYear();

  let taxDueThisMonth = 0;
  let filingsCompleted = 0;
  let filingInProgress = 0;

  const taxObligations: Array<{
    taxType: string;
    dueDate: Date;
    amount: number;
    status: "Pending" | "Overdue" | "Filed";
  }> = [];

  const breakdown: Record<string, number> = {
    total: 0,
    CIT: 0,
    VAT: 0,
    WHT: 0,
    PAYE: 0,
    PIT: 0,
  };

  for (const p of payables) {
    const totalPayable = decimalToNumber(p.totalPayable);
    const totalPaid = p.payments.reduce(
      (s, r) => s + decimalToNumber(r.amountPaid),
      0,
    );
    const due = new Date(p.filingDueDate);
    due.setHours(0, 0, 0, 0);

    let status: "Pending" | "Overdue" | "Filed" = "Pending";
    if (p.status === "paid" || totalPaid >= totalPayable || p.submittedAt) {
      status = "Filed";
      filingsCompleted++;
    } else {
      if (due < today) status = "Overdue";
      filingInProgress++;
    }

    taxObligations.push({
      taxType: p.taxType,
      dueDate: p.filingDueDate,
      amount: totalPayable,
      status,
    });

    if (p.periodYear === thisYear && p.periodMonth === thisMonth && status !== "Filed") {
      taxDueThisMonth += totalPayable - totalPaid;
    }

    const key = p.taxType in breakdown ? p.taxType : "total";
    if (key in breakdown) {
      breakdown[key as keyof typeof breakdown] += totalPayable;
    }
    breakdown.total += totalPayable;
  }

  const { getClientFinancialSummary } = await import("./clientDataHelper");
  const { taxComputationService } = await import("../../mobile/services/taxComputationService");
  const summary = await getClientFinancialSummary(linkedUserId);
  const comp = await taxComputationService.getForPeriod(
    linkedUserId,
    thisYear,
    thisMonth,
  );

  if (taxConfig?.vat ?? true) {
    breakdown.VAT = comp.vat.netVatPayable;
  }
  if (taxConfig?.cit ?? true) {
    const citPayable =
      Math.max(0, summary.netProfit) * (comp.cit.citRate / PERCENT);
    breakdown.CIT = citPayable;
  }
  if (taxConfig?.wht ?? true) {
    breakdown.WHT = comp.wht.estimatedWhtDeducted;
  }
  if (taxConfig?.paye ?? false) {
    const { employeesService } = await import("../../mobile/services/employeesService");
    const obligations = await employeesService.getObligations(linkedUserId);
    breakdown.PAYE = obligations.paye.amount;
  }
  if (taxConfig?.pit ?? false) {
    breakdown.PIT = comp.pit.estimatedAnnualPit / 12;
  }

  return {
    businessName,
    status: vatRequired ? "VAT required" : "VAT not required",
    filingAuthorization: consultantConnection?.filingAuthorization ?? null,
    metricData: {
      taxDueThisMonth,
      filingsCompleted,
      filingInProgress,
    },
    taxObligations,
    taxBreakdownByType: breakdown,
  };
}
