import { prisma } from "../config/database";

/** Active consultant–client link required to act on behalf of the client. */
export async function assertConsultantClientAccess(
  consultantUserId: string,
  clientUserId: string,
): Promise<boolean> {
  const row = await prisma.consultantConnection.findFirst({
    where: {
      consultantUserId,
      userId: clientUserId,
      status: "active",
    },
  });
  return !!row;
}

export type ConsultantFilingAuthResult =
  | { ok: true }
  | { ok: false; reason: "no_connection" | "filing_not_authorized" };

/**
 * Active connection + client-side filing authorization (mobile toggle).
 * Use for submit-filing-on-behalf-of-client flows.
 */
export async function assertConsultantFilingAuthorized(
  consultantUserId: string,
  clientUserId: string,
): Promise<ConsultantFilingAuthResult> {
  const row = await prisma.consultantConnection.findFirst({
    where: {
      consultantUserId,
      userId: clientUserId,
      status: "active",
    },
    select: { filingAuthorization: true },
  });
  if (!row) return { ok: false, reason: "no_connection" };
  if (!row.filingAuthorization) {
    return { ok: false, reason: "filing_not_authorized" };
  }
  return { ok: true };
}
