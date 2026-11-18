import { prisma } from "../../config/database";
import { CIT_RATE_STANDARD_PERCENT } from "../../constants/percentages";

/**
 * Stored client CIT rate in percentage points, or null when the client
 * has not saved tax assumptions.
 */
export async function storedClientCitRate(opts: {
  clientUserId?: string | null;
  companyId?: string | null;
}): Promise<number | null> {
  if (opts.clientUserId) {
    const row = await prisma.clientTaxAssumptions.findUnique({
      where: { clientUserId: opts.clientUserId },
      select: { applicationCitRate: true },
    });
    if (row) return row.applicationCitRate;
  }
  if (opts.companyId) {
    const row = await prisma.clientTaxAssumptions.findFirst({
      where: { companyId: opts.companyId },
      select: { applicationCitRate: true },
      orderBy: { updatedAt: "desc" },
    });
    if (row) return row.applicationCitRate;
  }
  return null;
}

/**
 * Client CIT rate in percentage points.
 * Uses the stored `applicationCitRate`. When the client has no assumptions row,
 * the rate is the column default (30).
 */
export async function clientApplicationCitRate(opts: {
  clientUserId?: string | null;
  companyId?: string | null;
}): Promise<number> {
  const stored = await storedClientCitRate(opts);
  return stored ?? CIT_RATE_STANDARD_PERCENT;
}
