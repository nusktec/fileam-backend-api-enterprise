import { prisma } from "../config/database";

/**
 * Ensures a minimal filing_drafts row for tax types without VAT/WHT-specific draft flows (e.g. CIT, PAYE).
 */
export async function upsertMinimalFilingDraft(
  userId: string,
  taxType: string,
  periodYear: number,
  periodMonth: number,
) {
  return prisma.filingDraft.upsert({
    where: {
      userId_taxType_periodYear_periodMonth: {
        userId,
        taxType,
        periodYear,
        periodMonth,
      },
    },
    create: {
      userId,
      taxType,
      periodYear,
      periodMonth,
      status: "draft",
    },
    update: {},
  });
}
