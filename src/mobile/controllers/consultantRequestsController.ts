import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { consultantRequestService } from "../../services/consultantRequestService";
import { parseInvitationDirectionFilter } from "../../utils/invitationPresenter";

export async function listConsultantRequests(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Authentication required", null));
    return;
  }
  try {
    const direction = parseInvitationDirectionFilter(
      req.query.direction as string | undefined,
    );
    const list = await consultantRequestService.listForUser(userId, direction);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Consultant requests", list));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list consultant requests", null));
  }
}

export async function acceptConsultantRequest(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Authentication required", null));
    return;
  }
  const invitationId = req.params.id as string;
  if (!invitationId) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Invitation ID is required", null));
    return;
  }
  try {
    const result = await consultantRequestService.acceptForUser(
      userId,
      invitationId,
    );
    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message, null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Request accepted", result.data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to accept request", null));
  }
}

export async function declineConsultantRequest(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Authentication required", null));
    return;
  }
  const invitationId = req.params.id as string;
  if (!invitationId) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Invitation ID is required", null));
    return;
  }
  try {
    const result = await consultantRequestService.declineForUser(
      userId,
      invitationId,
    );
    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message, null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Request declined", result.data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to decline request", null));
  }
}
