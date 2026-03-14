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

export async function listClientInvitations(
  req: IRequest,
  res: Response,
): Promise<void> {
  const consultantUserId = req.user?.id;
  if (!consultantUserId) {
    sendBadRequest(res, "Authentication required.");
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
    const invitations = await enterpriseClientsService.listInvitations(
      consultantUserId,
      statusTrimmed || undefined,
    );
    sendResult(res, "Client invitations", invitations);
  } catch {
    sendServerError(res, "Failed to list client invitations");
  }
}

export async function getClientInvitation(
  req: IRequest,
  res: Response,
): Promise<void> {
  const consultantUserId = req.user?.id;
  if (!consultantUserId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const invitationId = req.params.id as string;
  try {
    const invitation = await enterpriseClientsService.getInvitationById(
      consultantUserId,
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
  const consultantUserId = req.user?.id;
  if (!consultantUserId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const invitationId = req.params.id as string;
  try {
    const result = await enterpriseClientsService.cancelInvitation(
      consultantUserId,
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
  const consultantUserId = req.user?.id;
  if (!consultantUserId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  const invitationId = req.params.id as string;
  const extendExpiryHours = req.body?.extendExpiryHours as number | undefined;
  try {
    const result = await enterpriseClientsService.resendInvitation(
      consultantUserId,
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
  const consultantUserId = req.user?.id;
  if (!consultantUserId) {
    sendBadRequest(res, "Authentication required.");
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
    const clients = await enterpriseClientsService.listClients(
      consultantUserId,
      q || undefined,
      { type: type ?? "all" },
    );
    sendResult(res, "Clients", clients);
  } catch {
    sendServerError(res, "Failed to list clients");
  }
}
