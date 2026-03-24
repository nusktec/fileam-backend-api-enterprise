import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import {
  sendResult,
  sendBadRequest,
  sendServerError,
  sendNotFound,
} from "../utils/controllerHelpers";
import { listAvailableMobileUsers } from "../services/enterpriseAvailableClientsService";
import { prisma } from "../../config/database";
import { RandomAscii } from "../../utils/tools";
import { sendConsultantRequestEmail } from "../../services/emailService";

export async function listAvailableClients(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const q = (req.query.q as string | undefined)?.trim();
  try {
    const users = await listAvailableMobileUsers(q || undefined);
    sendResult(res, "Available mobile users (no consultant)", users);
  } catch {
    sendServerError(res, "Failed to list available clients");
  }
}

export async function sendClientRequest(
  req: IRequest,
  res: Response,
): Promise<void> {
  const consultantUserId = req.user?.id;
  if (!consultantUserId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const requestedUserId = (req.body.requestedUserId as string)?.trim();

  if (!requestedUserId) {
    sendBadRequest(res, "requestedUserId (client id) is required.");
    return;
  }

  const requestedUser = await prisma.user.findUnique({
    where: { id: requestedUserId },
    include: { businesses: { take: 1 } },
  });
  if (!requestedUser) {
    sendNotFound(res, "User not found.");
    return;
  }
  if (!requestedUser.onboardingComplete) {
    sendBadRequest(res, "User has not completed mobile onboarding.");
    return;
  }

  const existingConnection = await prisma.consultantConnection.findFirst({
    where: {
      userId: requestedUserId,
      status: "active",
    },
  });
  if (existingConnection) {
    sendBadRequest(res, "User already has a consultant.");
    return;
  }

  const existingPending = await prisma.invitation.findFirst({
    where: {
      consultantUserId,
      requestedUserId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
  });
  if (existingPending) {
    sendBadRequest(res, "You already have a pending request sent to this user.");
    return;
  }

  const now = new Date();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const existingRejectedOrExpired = await prisma.invitation.findFirst({
    where: {
      consultantUserId,
      AND: [
        {
          OR: [
            { requestedUserId },
            { invitedEmail: { equals: requestedUser.email, mode: "insensitive" as const } },
          ],
        },
        {
          OR: [
            { status: "rejected" },
            { status: "pending", expiresAt: { lt: now } },
          ],
        },
      ],
    },
  });

  let invitation: { id: string; code: string; expiresAt: Date };

  try {
    if (existingRejectedOrExpired) {
      let code = RandomAscii(6);
      let codeConflict = await prisma.invitation.findFirst({ where: { code } });
      while (codeConflict && codeConflict.id !== existingRejectedOrExpired.id) {
        code = RandomAscii(6);
        codeConflict = await prisma.invitation.findFirst({ where: { code } });
      }
      invitation = await prisma.invitation.update({
        where: { id: existingRejectedOrExpired.id },
        data: {
          code,
          requestedUserId,
          initiator: "consultant_to_client",
          invitedEmail: requestedUser.email,
          invitedBusinessName:
            requestedUser.businesses[0]?.name ??
            requestedUser.organizationName ??
            null,
          invitedContactName: `${requestedUser.firstName} ${requestedUser.lastName}`.trim() || null,
          status: "pending",
          expiresAt,
        },
      });
    } else {
      let code = RandomAscii(6);
      let exists = await prisma.invitation.findUnique({ where: { code } });
      while (exists) {
        code = RandomAscii(6);
        exists = await prisma.invitation.findUnique({ where: { code } });
      }
      invitation = await prisma.invitation.create({
        data: {
          code,
          consultantUserId,
          requestedUserId,
          initiator: "consultant_to_client",
          invitedEmail: requestedUser.email,
          invitedBusinessName:
            requestedUser.businesses[0]?.name ??
            requestedUser.organizationName ??
            null,
          invitedContactName: `${requestedUser.firstName} ${requestedUser.lastName}`.trim() || null,
          status: "pending",
          expiresAt,
        },
      });
    }

    const recipientName =
      (requestedUser.organizationName ??
        requestedUser.businesses[0]?.name ??
        `${requestedUser.firstName} ${requestedUser.lastName}`.trim()) ||
      requestedUser.email;

    const consultant = await prisma.user.findUnique({
      where: { id: consultantUserId },
      select: { firstName: true, lastName: true, organizationName: true },
    });
    const consultantName =
      consultant
        ? `${consultant.firstName} ${consultant.lastName}`.trim() ||
          consultant.organizationName ||
          "A consultant"
        : "A consultant";
    const emailResult = await sendConsultantRequestEmail(
      requestedUser.email,
      recipientName,
      consultantName,
      invitation.id,
      invitation.code,
      invitation.expiresAt,
    );
    if (!emailResult.success) {
      console.error("Failed to send consultant request email:", emailResult.error);
    }

    sendResult(res, "Request sent successfully", {
      id: invitation.id,
      requestedUserId,
      status: "pending",
      expiresAt,
    });
  } catch {
    sendServerError(res, "Failed to send request");
  }
}
