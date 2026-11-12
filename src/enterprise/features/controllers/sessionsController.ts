import { Response } from "express";
import { IRequest } from "../../../interfaces/CustomRequest";
import { getAuthUserId } from "../../../utils/authHelpers";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { outJson } from "../../../utils/renders";
import { sendResult, sendServerError } from "../../utils/controllerHelpers";
import { featuresSessionsService } from "../services/sessionsService";

export async function listSessions(req: IRequest, res: Response): Promise<void> {
  try {
    const data = await featuresSessionsService.list(
      getAuthUserId(req),
      req.sessionId,
    );
    sendResult(res, "Active sessions", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to list sessions");
  }
}

export async function revokeSession(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const data = await featuresSessionsService.revoke(
      getAuthUserId(req),
      String(req.params.id),
      req.sessionId,
    );
    sendResult(res, "Session revoked", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to revoke session");
  }
}
