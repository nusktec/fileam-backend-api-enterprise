import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import {
  sendResult,
  sendBadRequest,
  sendServerError,
  sendNotFound,
} from "../utils/controllerHelpers";
import {
  enterpriseClientsService,
  type ClientCard,
} from "../services/enterpriseClientsService";

const VALID_INVITATION_STATUSES = ["pending", "accepted", "rejected", "expired"];
import { prisma } from "../../config/database";

async function resolveCompanyId(userId: string): Promise<string | null> {
  const company = await prisma.company.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return company?.id ?? null;
}

export async function listClientInvitations(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const companyIdParam = (req.query.companyId as string)?.trim();
  let companyIds: string[];
  if (companyIdParam) {
    companyIds = [companyIdParam];
  } else {
    const companies = await prisma.company.findMany({
      where: { ownerId: userId, linkedUserId: null, managedByCompanyId: null },
      select: { id: true },
    });
    companyIds = companies.map((c) => c.id);
  }
  if (companyIds.length === 0) {
    sendNotFound(res, "No company found. Create a company first.");
    return;
  }
  const status = (req.query.status as string | undefined) ?? "";
  const statusTrimmed = status.trim().toLowerCase();
  if (statusTrimmed) {
    const parts = statusTrimmed.split(",").map((s) => s.trim()).filter(Boolean);
    const invalid = parts.filter((p) => !VALID_INVITATION_STATUSES.includes(p));
    if (invalid.length) {
      sendBadRequest(
        res,
        `Invalid status. Must be one or more of: ${VALID_INVITATION_STATUSES.join(", ")} (comma-separated for multiple).`,
      );
      return;
    }
  }
  try {
    const allInvitations: Awaited<ReturnType<typeof enterpriseClientsService.listInvitations>> = [];
    for (const cid of companyIds) {
      const invitations = await enterpriseClientsService.listInvitations(
        cid,
        statusTrimmed || undefined,
      );
      allInvitations.push(...invitations);
    }
    sendResult(res, "Client invitations", allInvitations);
  } catch {
    sendServerError(res, "Failed to list client invitations");
  }
}

export async function getClientInvitation(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const companyId = await resolveCompanyId(userId);
  if (!companyId) {
    sendNotFound(res, "No company found. Create a company first.");
    return;
  }
  const invitationId = req.params.id as string;
  try {
    const invitation = await enterpriseClientsService.getInvitationById(
      companyId,
      invitationId,
    );
    if (!invitation) {
      sendNotFound(res, "Invitation not found.");
      return;
    }
    sendResult(res, "Client invitation", invitation);
  } catch {
    sendServerError(res, "Failed to get client invitation");
  }
}

export async function cancelClientInvitation(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const companyId = await resolveCompanyId(userId);
  if (!companyId) {
    sendNotFound(res, "No company found. Create a company first.");
    return;
  }
  const invitationId = req.params.id as string;
  try {
    const result = await enterpriseClientsService.cancelInvitation(
      companyId,
      invitationId,
    );
    if (result === "not_found") {
      sendNotFound(res, "Invitation not found.");
      return;
    }
    if (result === "not_pending") {
      sendBadRequest(res, "Only pending invitations can be cancelled.");
      return;
    }
    sendResult(res, "Invitation cancelled.", null);
  } catch {
    sendServerError(res, "Failed to cancel invitation");
  }
}

export async function resendClientInvitation(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const companyId = await resolveCompanyId(userId);
  if (!companyId) {
    sendNotFound(res, "No company found. Create a company first.");
    return;
  }
  const invitationId = req.params.id as string;
  const extendExpiryHours = req.body?.extendExpiryHours as number | undefined;
  try {
    const result = await enterpriseClientsService.resendInvitation(
      companyId,
      invitationId,
      extendExpiryHours,
    );
    if (!result.success) {
      if (result.reason === "not_found") {
        sendNotFound(res, "Invitation not found.");
        return;
      }
      if (result.reason === "not_pending") {
        sendBadRequest(res, "Only pending invitations can be resent.");
        return;
      }
      sendBadRequest(res, "Invitation has expired. Create a new invitation instead.");
      return;
    }
    sendResult(res, "Invitation resent.", result.invitation);
  } catch {
    sendServerError(res, "Failed to resend invitation");
  }
}

export async function listClients(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const companyIdParam = (req.query.companyId as string)?.trim();
  let companyIds: string[];
  if (companyIdParam) {
    companyIds = [companyIdParam];
  } else {
    const companies = await prisma.company.findMany({
      where: { ownerId: userId, linkedUserId: null, managedByCompanyId: null },
      select: { id: true },
    });
    companyIds = companies.map((c) => c.id);
  }
  if (companyIds.length === 0) {
    sendNotFound(res, "No company found. Create a company first.");
    return;
  }
  const rawQ = (req.query.q as string | undefined)?.trim() ?? "";
  const q = rawQ === "=" ? "" : rawQ;
  const typeParam = (req.query.type as string)?.trim().toLowerCase();
  const type =
    typeParam === "accepted" || typeParam === "pending"
      ? (typeParam as "accepted" | "pending")
      : undefined;
  try {
    const allClients: ClientCard[] = [];
    for (const cid of companyIds) {
      const clients = await enterpriseClientsService.listClients(cid, q || undefined, {
        type: type ?? "all",
      });
      allClients.push(...clients);
    }
    sendResult(res, "Clients", allClients);
  } catch {
    sendServerError(res, "Failed to list clients");
  }
}
