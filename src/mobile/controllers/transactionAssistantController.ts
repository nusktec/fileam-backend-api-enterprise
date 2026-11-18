import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { HttpStatusCode } from "../../interfaces/system";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { outJson } from "../../utils/renders";
import { transactionAssistantService } from "../services/transactionAssistantService";

function sendError(res: Response, statusCode: number, message: string): void {
  res.status(statusCode).json({ status: false, message });
}

export async function getAutoExport(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const data = await transactionAssistantService.get(getAuthUserId(req));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Auto-export settings retrieved", data));
  } catch {
    sendError(
      res,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      "Failed to retrieve auto-export settings",
    );
  }
}

export async function patchAutoExport(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const data = await transactionAssistantService.update(
      getAuthUserId(req),
      req.body,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Auto-export settings saved", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      sendError(res, error.statusCode, error.message);
      return;
    }
    sendError(
      res,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      "Failed to save auto-export settings",
    );
  }
}
