import { prisma } from "../config/database";
import { sendEmail } from "./emailService";

export interface ConsultantRequestItem {
  id: string;
  consultantUserId: string;
  consultantName: string;
  consultantOrganization: string | null;
  invitedBusinessName: string | null;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}

export const consultantRequestService = {
  async listForUser(userId: string): Promise<ConsultantRequestItem[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const userEmail = user?.email?.toLowerCase().trim() ?? "";

    const invitations = await prisma.invitation.findMany({
      where: {
        OR: [
          { requestedUserId: userId },
          ...(userEmail ? [{ invitedEmail: { equals: userEmail, mode: "insensitive" as const } }] : []),
        ],
        status: "pending",
        expiresAt: { gte: new Date() },
      },
      include: {
        consultantUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            organizationName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      consultantUserId: inv.consultantUserId,
      consultantName:
        `${inv.consultantUser.firstName} ${inv.consultantUser.lastName}`.trim() ||
        inv.consultantUser.organizationName ||
        "Consultant",
      consultantOrganization: inv.consultantUser.organizationName ?? null,
      invitedBusinessName: inv.invitedBusinessName ?? null,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  },

  async acceptForUser(userId: string, invitationId: string) {
    const inv = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { consultantUser: true },
    });

    if (!inv || inv.status !== "pending") {
      return { success: false as const, message: "Invalid or expired request" };
    }
    if (new Date() > inv.expiresAt) {
      return { success: false as const, message: "Request has expired" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, organizationName: true },
    });
    const isRecipient =
      inv.requestedUserId === userId ||
      (user?.email && inv.invitedEmail.toLowerCase() === user.email.toLowerCase());

    if (!isRecipient) {
      return { success: false as const, message: "This request was not sent to you" };
    }

    if (inv.requestedUserId === null) {
      await prisma.invitation.update({
        where: { id: inv.id },
        data: { requestedUserId: userId },
      });
    }
    const targetUserId = inv.requestedUserId ?? userId;

    const business = await prisma.business.findFirst({
      where: { userId: targetUserId },
    });
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });
    const clientCompanyName =
      inv.invitedBusinessName?.trim() ||
      business?.name ||
      targetUser?.organizationName ||
      (targetUser ? `${targetUser.firstName} ${targetUser.lastName}`.trim() : "") ||
      targetUser?.email ||
      "Client";

    const now = new Date();
    const clientCompany = await prisma.company.create({
      data: {
        name: clientCompanyName,
        ownerId: inv.consultantUserId,
        linkedUserId: targetUserId,
        managedByCompanyId: null,
      },
    });

    await prisma.$transaction([
      prisma.consultantConnection.create({
        data: {
          consultantUserId: inv.consultantUserId,
          userId: targetUserId,
          invitationId: inv.id,
          acceptedAt: now,
          consultantTermsAccepted: true,
          status: "active",
        },
      }),
      prisma.invitation.update({
        where: { id: inv.id },
        data: { status: "accepted" },
      }),
    ]);

    const consultantUser = await prisma.user.findUnique({
      where: { id: inv.consultantUserId },
      select: { email: true },
    });
    if (consultantUser?.email) {
      const clientName =
        targetUser?.organizationName ?? business?.name ?? targetUser?.email ?? "A client";
      await sendEmail(
        consultantUser.email,
        "Client Accepted Your Request - Fileam",
        `<p>${clientName} has accepted your consultant request. You can now fully manage their tax operations.</p><p><a href="https://fileam.app">Go to Fileam</a></p>`,
      );
    }

    return {
      success: true as const,
      data: { companyId: clientCompany.id, status: "accepted" },
    };
  },

  async declineForUser(userId: string, invitationId: string) {
    const inv = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!inv || inv.status !== "pending") {
      return { success: false as const, message: "Invalid or expired request" };
    }
    if (new Date() > inv.expiresAt) {
      return { success: false as const, message: "Request has expired" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const isRecipient =
      inv.requestedUserId === userId ||
      (user?.email && inv.invitedEmail.toLowerCase() === user.email.toLowerCase());

    if (!isRecipient) {
      return { success: false as const, message: "This request was not sent to you" };
    }

    await prisma.invitation.update({
      where: { id: inv.id },
      data: { status: "rejected" },
    });

    return { success: true as const, data: { status: "rejected" } };
  },
};
