import { Response } from "express";
import { matchedData } from "express-validator";
import { prisma } from "../../config/database";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { RandomAscii } from "../../utils/tools";
import { sendInvitationToJoinEmail } from "../../services/emailService";
import { sendResult, sendServerError } from "../utils/controllerHelpers";
import { listManagedEntities } from "../services/enterpriseManagedEntitiesService";

export async function listManagedEntitiesHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Authentication required.", null));
    return;
  }
  const q = (req.query.q as string)?.trim();
  try {
    const entities = await listManagedEntities(userId, q);
    sendResult(res, "Managed entities (companies and clients)", entities);
  } catch {
    sendServerError(res, "Failed to list managed entities");
  }
}

export async function listCompanies(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Authentication required.", null));
    return;
  }
  const q = (req.query.q as string)?.trim();
  try {
    const companies = await prisma.company.findMany({
      where: {
        ownerId: userId,
        linkedUserId: null,
        managedByCompanyId: null,
        ...(q && { name: { contains: q, mode: "insensitive" as const } }),
      },
      include: {
        enterpriseBusinessProfile: {
          select: {
            companyName: true,
            businessType: true,
            industry: true,
            tin: true,
            businessAddress: true,
            phoneNumber: true,
            emailAddress: true,
            website: true,
          },
        },
        consultantConnections: {
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
          },
        },
        invitations: {
          where: { status: "pending" },
          select: { id: true, invitedEmail: true, invitedBusinessName: true, status: true, expiresAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const userIds = companies.flatMap((c) =>
      c.consultantConnections.map((conn) => conn.userId),
    );
    const businesses = await prisma.business.findMany({
      where: { userId: { in: userIds } },
    });
    const businessByUser = new Map(businesses.map((b) => [b.userId, b]));

    const result = companies.map((c) => {
      const clients = c.consultantConnections.map((conn) => {
        const business = businessByUser.get(conn.userId);
        const user = conn.user;
        const displayName =
          (user.organizationName ??
            business?.name ??
            `${user.firstName} ${user.lastName}`.trim()) ||
          user.email;
        return {
          id: conn.userId,
          connectionId: conn.id,
          email: user.email,
          businessName: displayName,
          rcNumber: business?.rcNumber ?? null,
          tin: business?.tin ?? null,
          status: conn.status,
        };
      });
      const pendingInvitations = c.invitations.map((inv) => ({
        id: inv.id,
        invitedEmail: inv.invitedEmail,
        invitedBusinessName: inv.invitedBusinessName,
        status: inv.expiresAt > new Date() ? "pending" : "expired",
        expiresAt: inv.expiresAt,
      }));
      return {
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        business: c.enterpriseBusinessProfile
          ? {
              companyName: c.enterpriseBusinessProfile.companyName,
              businessType: c.enterpriseBusinessProfile.businessType,
              industry: c.enterpriseBusinessProfile.industry,
              tin: c.enterpriseBusinessProfile.tin,
              businessAddress: c.enterpriseBusinessProfile.businessAddress,
              phoneNumber: c.enterpriseBusinessProfile.phoneNumber,
              emailAddress: c.enterpriseBusinessProfile.emailAddress,
              website: c.enterpriseBusinessProfile.website,
            }
          : null,
        clients,
        pendingInvitations,
      };
    });
    sendResult(res, "Companies", result);
  } catch {
    sendServerError(res, "Failed to list companies");
  }
}

export async function createCompany(
  req: IRequest,
  res: Response,
): Promise<void> {
  const data = matchedData(req, { locations: ["body"] }) as { name: string };
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Authentication required.", null));
    return;
  }
  try {
    const company = await prisma.company.create({
      data: { name: data.name, ownerId: userId },
    });
    await prisma.user.update({
      where: { id: userId },
      data: {
        enterpriseOnboardingComplete: true,
        enterpriseOnboardingStep: "complete",
      } as { enterpriseOnboardingComplete: boolean; enterpriseOnboardingStep: string },
    });
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Company created", company));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create company", null));
  }
}

export async function createInvitation(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Authentication required.", null));
    return;
  }
  const data = matchedData(req, {
    locations: ["body"],
    includeOptionals: true,
  }) as {
    invitedEmail: string;
    companyId?: string;
    invitedBusinessName?: string;
    expiresInHours?: number;
    invitedContactName?: string;
    invitedRcNumber?: string;
    invitedPhone?: string;
    stateOfOperation?: string;
    taxTypesManaged?: string[] | string;
  };
  const {
    invitedEmail,
    companyId: companyIdParam,
    invitedBusinessName,
    expiresInHours,
    invitedContactName,
    invitedRcNumber,
    invitedPhone,
    stateOfOperation,
    taxTypesManaged,
  } = data;

  let company: { id: string } | null;
  if (companyIdParam) {
    company = await prisma.company.findFirst({
      where: {
        id: companyIdParam,
        ownerId: userId,
        linkedUserId: null,
        managedByCompanyId: null,
      },
      select: { id: true },
    });
    if (!company) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Company not found or you do not have access to it.", null));
      return;
    }
  } else {
    company = await prisma.company.findFirst({
      where: { ownerId: userId, linkedUserId: null, managedByCompanyId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!company) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Create a company first before sending invitations.", null));
      return;
    }
  }
  const companyId = company.id;
  const normalizedEmail = invitedEmail.trim().toLowerCase();

  const existingPending = await prisma.invitation.findFirst({
    where: {
      companyId,
      invitedEmail: normalizedEmail,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
  });
  if (existingPending) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(
        outJson(false, "You already have a pending invitation sent to this email.", null),
      );
    return;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existingUser) {
    const alreadyClient = await prisma.consultantConnection.findFirst({
      where: {
        companyId,
        userId: existingUser.id,
        status: "active",
      },
    });
    if (alreadyClient) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(false, "This user has already accepted an invitation and is added as a client.", null),
        );
      return;
    }
  }

  const hours = Math.min(Math.max(Number(expiresInHours) || 168, 1), 720);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  let code = RandomAscii(6);
  let exists = await prisma.invitation.findUnique({ where: { code } });
  while (exists) {
    code = RandomAscii(6);
    exists = await prisma.invitation.findUnique({ where: { code } });
  }
  const taxTypesStr =
    taxTypesManaged == null
      ? null
      : Array.isArray(taxTypesManaged)
        ? JSON.stringify(taxTypesManaged)
        : typeof taxTypesManaged === "string"
          ? taxTypesManaged
          : null;
  try {
    const invitation = await prisma.invitation.create({
      data: {
        code,
        companyId,
        invitedEmail: normalizedEmail,
        invitedBusinessName: invitedBusinessName ? invitedBusinessName.trim() : null,
        invitedContactName: invitedContactName ? invitedContactName.trim() : null,
        invitedRcNumber: invitedRcNumber ? invitedRcNumber.trim() : null,
        invitedPhone: invitedPhone ? invitedPhone.trim() : null,
        stateOfOperation: stateOfOperation ? stateOfOperation.trim() : null,
        taxTypesManaged: taxTypesStr,
        status: "pending",
        expiresAt,
      },
    });

    const recipientName =
      invitedContactName?.trim() ||
      invitedBusinessName?.trim() ||
      invitedEmail.trim();
    const emailResult = await sendInvitationToJoinEmail(
      invitation.invitedEmail,
      recipientName,
      invitation.code,
      invitation.expiresAt,
    );
    if (!emailResult.success) {
      console.error("Failed to send invitation email:", emailResult.error);
    }

    res
      .status(HttpStatusCode.CREATED)
      .json(
        outJson(true, "Invitation sent successfully. The business owner will receive an email invitation to join FileAm.", {
          ...invitation,
          status: "Pending Acceptance",
        }),
      );
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create invitation", null));
  }
}
