import { Response } from "express";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { outJson } from "../../utils/renders";
import {
  listAvailableConsultants,
  listPendingOutgoingInvitations,
  requestConsultantConnection,
} from "../services/consultantDirectoryService";

export async function listConsultants(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Unauthorized", null));
    return;
  }
  const q = (req.query.q as string | undefined)?.trim();
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  try {
    const result = await listAvailableConsultants(userId, { q, page, limit });
    res.status(HttpStatusCode.OK).json(outJson(true, "Consultants", result));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list consultants", null));
  }
}

export async function listPendingSentInvitations(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Unauthorized", null));
    return;
  }
  try {
    const list = await listPendingOutgoingInvitations(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Pending invitations you sent", list));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list pending invitations", null));
  }
}

export async function requestConsultant(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Unauthorized", null));
    return;
  }
  const consultantUserId = (req.body?.consultantUserId as string | undefined)?.trim();
  if (!consultantUserId) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "consultantUserId is required", null));
    return;
  }
  try {
    const result = await requestConsultantConnection(userId, consultantUserId);
    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message, null));
      return;
    }
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Request sent to consultant", result.data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to send request", null));
  }
}
