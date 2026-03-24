import { prisma } from "../../config/database";
import {
  sendInvitationToJoinEmail,
  sendConsultantRequestEmail,
  sendConsultantIncomingClientRequestEmail,
} from "../../services/emailService";

export interface InvitationCard {
  id: string;
  consultantUserId?: string;
  initiator?: "consultant_to_client" | "client_to_consultant";
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
  consultantUserId?: string;
  initiator?: "consultant_to_client" | "client_to_consultant";
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
    ...(inv.consultantUserId && { consultantUserId: inv.consultantUserId }),
    ...(inv.initiator && { initiator: inv.initiator }),
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
  companyRegNumber: string | null;
  rcNumber: string | null;
  isActive: boolean;
  status: string;
  vatStatus: "Registered" | "Unregistered" | "Pending";
  nextFiling: { taxType: string; dueDate: Date } | null;
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
    consultantUserId: string,
    status?: string,
  ): Promise<InvitationCard[]> {
    const now = new Date();
    const statusParam = (status ?? "").trim().toLowerCase();
    const statuses = statusParam ? statusParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

    const where: Record<string, unknown> = { consultantUserId };

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

    const invitations = await prisma.invitation.findMany({
      where,
      select: {
        id: true,
        consultantUserId: true,
        initiator: true,
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
    consultantUserId: string,
    invitationId: string,
  ): Promise<InvitationCard | null> {
    const inv = await prisma.invitation.findFirst({
      where: { id: invitationId, consultantUserId },
    });
    if (!inv) return null;
    return shapeInvitationToCard(inv);
  },

  async cancelInvitation(
    consultantUserId: string,
    invitationId: string,
  ): Promise<"ok" | "not_found" | "not_pending"> {
    const inv = await prisma.invitation.findFirst({
      where: { id: invitationId, consultantUserId },
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
    consultantUserId: string,
    invitationId: string,
    extendExpiryHours?: number,
  ): Promise<{ success: true; invitation: InvitationCard } | { success: false; reason: "not_found" | "not_pending" | "expired" }> {
    const inv = await prisma.invitation.findFirst({
      where: { id: invitationId, consultantUserId },
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

    if (inv.initiator === "client_to_consultant" && inv.requestedUserId) {
      const [consultant, clientUser] = await Promise.all([
        prisma.user.findUnique({
          where: { id: inv.consultantUserId },
          select: { firstName: true, lastName: true, organizationName: true, email: true },
        }),
        prisma.user.findUnique({
          where: { id: inv.requestedUserId },
          include: { businesses: { take: 1 } },
        }),
      ]);
      const consultantGreeting =
        consultant
          ? `${consultant.firstName} ${consultant.lastName}`.trim() ||
            consultant.organizationName ||
            consultant.email
          : inv.invitedEmail;
      const clientDisplayName =
        clientUser?.organizationName ??
        clientUser?.businesses[0]?.name ??
        ((clientUser
          ? `${clientUser.firstName} ${clientUser.lastName}`.trim()
          : "") ||
          clientUser?.email ||
          recipientName);
      const emailResult = await sendConsultantIncomingClientRequestEmail(
        inv.invitedEmail,
        consultantGreeting ?? inv.invitedEmail,
        clientDisplayName,
        inv.id,
        inv.code,
        newExpiresAt,
      );
      if (!emailResult.success) {
        console.error(
          "Failed to resend consultant incoming request email:",
          emailResult.error,
        );
      }
    } else if (inv.requestedUserId) {
      const consultant = await prisma.user.findUnique({
        where: { id: inv.consultantUserId },
        select: { firstName: true, lastName: true, organizationName: true },
      });
      const consultantName =
        consultant
          ? `${consultant.firstName} ${consultant.lastName}`.trim() ||
            consultant.organizationName ||
            "A consultant"
          : "A consultant";
      const emailResult = await sendConsultantRequestEmail(
        inv.invitedEmail,
        recipientName,
        consultantName,
        inv.id,
        inv.code,
        newExpiresAt,
      );
      if (!emailResult.success) {
        console.error("Failed to resend consultant request email:", emailResult.error);
      }
    } else {
      const emailResult = await sendInvitationToJoinEmail(
        inv.invitedEmail,
        recipientName,
        inv.code,
        newExpiresAt,
      );
      if (!emailResult.success) {
        console.error("Failed to resend invitation email:", emailResult.error);
      }
    }

    return { success: true, invitation: shapeInvitationToCard(updated) };
  },


  async listClients(
    consultantUserId: string,
    query?: string,
    options?: { type?: "all" | "accepted" | "pending" },
  ): Promise<ClientCard[]> {
    const [connections, pendingInvitations] = await Promise.all([
      prisma.consultantConnection.findMany({
        where: { consultantUserId },
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
        },
      }),
      options?.type === "accepted"
        ? []
        : prisma.invitation.findMany({
            where: {
              consultantUserId,
              status: "pending",
              consultantConnections: { none: {} },
            },
            include: {
              requestedUser: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true,
                  organizationName: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          }),
    ]);

    const clientUserIds = connections.map((c) => c.userId);
    const clientCompanies = await prisma.company.findMany({
      where: {
        ownerId: consultantUserId,
        linkedUserId: { in: clientUserIds },
      },
      select: { id: true, name: true, linkedUserId: true },
    });
    const companyByUser = new Map(
      clientCompanies.map((c) => [c.linkedUserId!, { id: c.id, name: c.name }] as [string, { id: string; name: string }]),
    );

    const userIds = connections.map((c) => c.userId);
    const [businesses, nextPayables] = await Promise.all([
      prisma.business.findMany({ where: { userId: { in: userIds } } }),
      prisma.taxPayable.findMany({
        where: {
          userId: { in: userIds },
          status: { in: ["pending", "draft"] },
          filingDueDate: { gte: new Date() },
        },
        orderBy: { filingDueDate: "asc" },
      }),
    ]);
    const businessByUser = new Map(businesses.map((b) => [b.userId, b]));
    const nextByUser = new Map<string, { taxType: string; dueDate: Date }>();
    for (const p of nextPayables) {
      if (!nextByUser.has(p.userId)) {
        nextByUser.set(p.userId, { taxType: p.taxType, dueDate: p.filingDueDate });
      }
    }

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
        const clientCompany = companyByUser.get(conn.userId);
        const vatStatusRaw = (business?.vatStatus ?? "").toLowerCase();
        const vatStatus: ClientCard["vatStatus"] =
          vatStatusRaw === "registered" ? "Registered" : vatStatusRaw === "unregistered" ? "Unregistered" : "Pending";
        const nextFiling = nextByUser.get(conn.userId) ?? null;
        cards.push({
          id: conn.userId,
          connectionId: conn.id,
          businessName: displayName,
          companyRegNumber: business?.rcNumber ?? null,
          rcNumber: business?.rcNumber ?? null,
          isActive: conn.status === "active",
          status: statusLabel,
          vatStatus,
          nextFiling,
          email: user.email,
          tin: business?.tin ?? null,
          type: "accepted" as const,
          company: clientCompany,
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
        const ru = inv.requestedUser;
        const clientInitiated = inv.initiator === "client_to_consultant";
        const businessName = clientInitiated && ru
          ? (ru.organizationName?.trim() ||
              `${ru.firstName} ${ru.lastName}`.trim() ||
              ru.email)
          : inv.invitedBusinessName?.trim() ||
            inv.invitedContactName?.trim() ||
            inv.invitedEmail;
        const email =
          clientInitiated && ru ? ru.email : inv.invitedEmail;
        cards.push({
          id: inv.id,
          connectionId: "",
          businessName,
          companyRegNumber: inv.invitedRcNumber ?? null,
          rcNumber: inv.invitedRcNumber ?? null,
          isActive: false,
          status: isExpired
            ? "Expired Invitation"
            : clientInitiated
              ? "Client requested connection"
              : "Pending Invitation",
          vatStatus: "Pending" as const,
          nextFiling: null,
          email,
          tin: null,
          invitationId: inv.id,
          type: "pending" as const,
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
        (c.companyRegNumber ?? "").toLowerCase().includes(q) ||
        (c.tin ?? "").toLowerCase().includes(q),
    );
  },
};
