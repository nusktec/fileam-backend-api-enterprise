import { prisma } from "../../config/database";
import { sendInvitationToJoinEmail } from "../../services/emailService";

export interface InvitationCard {
  id: string;
  companyId?: string;
  invitedEmail: string;
  invitedBusinessName: string | null;
  invitedContactName: string | null;
  invitedRcNumber: string | null;
  invitedPhone: string | null;
  stateOfOperation: string | null;
  taxTypesManaged: string[] | null;
  status: "pending" | "accepted" | "rejected" | "expired";
  expiresAt: Date;
  createdAt: Date;
}

function shapeInvitationToCard(inv: {
  id: string;
  companyId?: string;
  invitedEmail: string;
  invitedBusinessName: string | null;
  invitedRcNumber: string | null;
  invitedContactName: string | null;
  invitedPhone: string | null;
  stateOfOperation: string | null;
  taxTypesManaged: string | null;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}): InvitationCard {
  const now = new Date();
  const isExpired = inv.status === "pending" && inv.expiresAt < now;
  let parsedTaxTypes: string[] | null = null;
  if (inv.taxTypesManaged) {
    try {
      const parsed = JSON.parse(inv.taxTypesManaged);
      parsedTaxTypes = Array.isArray(parsed) ? parsed : [inv.taxTypesManaged];
    } catch {
      parsedTaxTypes = [inv.taxTypesManaged];
    }
  }
  return {
    id: inv.id,
    ...(inv.companyId && { companyId: inv.companyId }),
    invitedEmail: inv.invitedEmail,
    invitedBusinessName: inv.invitedBusinessName ?? null,
    invitedContactName: inv.invitedContactName ?? null,
    invitedRcNumber: inv.invitedRcNumber ?? null,
    invitedPhone: inv.invitedPhone ?? null,
    stateOfOperation: inv.stateOfOperation ?? null,
    taxTypesManaged: parsedTaxTypes,
    status: isExpired ? "expired" : (inv.status as InvitationCard["status"]),
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
  };
}

export interface ClientCard {
  id: string;
  connectionId: string;
  businessName: string;
  rcNumber: string | null;
  status: string;
  vatStatus: string;
  nextFiling: string | null;
  riskLevel?: string;
  email: string;
  tin: string | null;
  invitationId?: string;
  type?: "accepted" | "pending";
  company?: { id: string; name: string };
  business?: {
    id: string;
    name: string;
    rcNumber: string | null;
    tin: string | null;
    incomeType: string;
    stateOfResidence: string | null;
    streetAddress: string | null;
  };
}

export const enterpriseClientsService = {
  async listInvitations(
    companyId: string,
    status?: string,
  ): Promise<InvitationCard[]> {
    const now = new Date();
    const statusParam = (status ?? "").trim().toLowerCase();
    const statuses = statusParam ? statusParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

    const where: Record<string, unknown> = { companyId };

    if (statuses.includes("expired")) {
      where.status = "pending";
      where.expiresAt = { lt: now };
    } else if (statuses.length === 1) {
      where.status = statuses[0];
      if (statuses[0] === "pending") {
        where.expiresAt = { gte: now };
      }
    } else if (statuses.length >= 2) {
      const conditions: Record<string, unknown>[] = [];
      if (statuses.includes("pending")) {
        conditions.push({ status: "pending" as const, expiresAt: { gte: now } });
      }
      for (const s of statuses) {
        if (s !== "pending" && s !== "expired") {
          conditions.push({ status: s });
        }
      }
      where.OR = conditions;
    }
    // When no status or empty: return all invitations for this company (pending, accepted, rejected, expired)
    // shapeInvitationToCard will normalize expired (pending + past expiry) to "expired"

    const invitations = await prisma.invitation.findMany({
      where,
      select: {
        id: true,
        companyId: true,
        invitedEmail: true,
        invitedBusinessName: true,
        invitedRcNumber: true,
        invitedContactName: true,
        invitedPhone: true,
        stateOfOperation: true,
        taxTypesManaged: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return invitations.map(shapeInvitationToCard);
  },

  async getInvitationById(
    companyId: string,
    invitationId: string,
  ): Promise<InvitationCard | null> {
    const inv = await prisma.invitation.findFirst({
      where: { id: invitationId, companyId },
    });
    if (!inv) return null;
    return shapeInvitationToCard(inv);
  },

  async cancelInvitation(
    companyId: string,
    invitationId: string,
  ): Promise<"ok" | "not_found" | "not_pending"> {
    const inv = await prisma.invitation.findFirst({
      where: { id: invitationId, companyId },
    });
    if (!inv) return "not_found";
    if (inv.status !== "pending") return "not_pending";
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "rejected" },
    });
    return "ok";
  },

  async resendInvitation(
    companyId: string,
    invitationId: string,
    extendExpiryHours?: number,
  ): Promise<{ success: true; invitation: InvitationCard } | { success: false; reason: "not_found" | "not_pending" | "expired" }> {
    const inv = await prisma.invitation.findFirst({
      where: { id: invitationId, companyId },
    });
    if (!inv) return { success: false, reason: "not_found" };
    if (inv.status !== "pending") return { success: false, reason: "not_pending" };
    const now = new Date();
    if (inv.expiresAt < now) return { success: false, reason: "expired" };

    const hours = Math.min(Math.max(Number(extendExpiryHours) || 168, 1), 720);
    const newExpiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { expiresAt: newExpiresAt },
    });

    const updated = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!updated) return { success: false, reason: "not_found" };

    const recipientName =
      inv.invitedContactName?.trim() ||
      inv.invitedBusinessName?.trim() ||
      inv.invitedEmail;
    const emailResult = await sendInvitationToJoinEmail(
      inv.invitedEmail,
      recipientName,
      inv.code,
      newExpiresAt,
    );
    if (!emailResult.success) {
      console.error("Failed to resend invitation email:", emailResult.error);
    }

    return { success: true, invitation: shapeInvitationToCard(updated) };
  },


  async listClients(
    companyId: string,
    query?: string,
    options?: { type?: "all" | "accepted" | "pending" },
  ): Promise<ClientCard[]> {
    const [connections, company, pendingInvitations] = await Promise.all([
      prisma.consultantConnection.findMany({
        where: { companyId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              organizationName: true,
            },
          },
          invitation: { select: { invitedBusinessName: true } },
          company: { select: { id: true, name: true } },
        },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true },
      }),
      options?.type === "accepted"
        ? []
        : prisma.invitation.findMany({
            where: {
              companyId,
              status: "pending",
              consultantConnections: { none: {} },
            },
            orderBy: { createdAt: "desc" },
          }),
    ]);

    const userIds = connections.map((c) => c.userId);
    const businesses = await prisma.business.findMany({
      where: { userId: { in: userIds } },
    });
    const businessByUser = new Map(businesses.map((b) => [b.userId, b]));

    const typeFilter = options?.type ?? "all";
    const cards: ClientCard[] = [];
    const now = new Date();

    if (typeFilter === "all" || typeFilter === "accepted") {
      for (const conn of connections) {
        const user = conn.user;
        const business = businessByUser.get(conn.userId);
        const displayName =
          conn.invitation?.invitedBusinessName ??
          user.organizationName ??
          business?.name ??
          (`${user.firstName} ${user.lastName}`.trim() || user.email);
        const statusLabel =
          conn.status === "active"
            ? "Active"
            : conn.status === "revoked"
              ? "Revoked"
              : "Pending Approval";
        cards.push({
          id: conn.userId,
          connectionId: conn.id,
          businessName: displayName,
          rcNumber: business?.rcNumber ?? null,
          status: statusLabel,
          vatStatus: "Pending",
          nextFiling: null,
          email: user.email,
          tin: business?.tin ?? null,
          type: "accepted" as const,
          company: conn.company ? { id: conn.company.id, name: conn.company.name } : company ? { id: company.id, name: company.name } : undefined,
          business: business
            ? {
                id: business.id,
                name: business.name,
                rcNumber: business.rcNumber ?? null,
                tin: business.tin ?? null,
                incomeType: business.incomeType,
                stateOfResidence: business.stateOfResidence ?? null,
                streetAddress: business.streetAddress ?? null,
              }
            : undefined,
        });
      }
    }

    if (typeFilter === "all" || typeFilter === "pending") {
      for (const inv of pendingInvitations) {
        const isExpired = inv.expiresAt < now;
        cards.push({
          id: inv.invitedEmail,
          connectionId: "",
          businessName:
            inv.invitedBusinessName?.trim() ||
            inv.invitedContactName?.trim() ||
            inv.invitedEmail,
          rcNumber: inv.invitedRcNumber ?? null,
          status: isExpired ? "Expired Invitation" : "Pending Invitation",
          vatStatus: "Pending",
          nextFiling: null,
          email: inv.invitedEmail,
          tin: null,
          invitationId: inv.id,
          type: "pending" as const,
          company: company ? { id: company.id, name: company.name } : undefined,
        });
      }
    }

    const searchQuery = (query ?? "").trim();
    if (searchQuery.length < 2) return cards;

    const q = searchQuery.toLowerCase();
    return cards.filter(
      (c) =>
        c.businessName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.rcNumber ?? "").toLowerCase().includes(q) ||
        (c.tin ?? "").toLowerCase().includes(q),
    );
  },
};
