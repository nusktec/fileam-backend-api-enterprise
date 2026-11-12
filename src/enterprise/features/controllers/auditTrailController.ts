import { Response } from "express";
import { IRequest } from "../../../interfaces/CustomRequest";
import { getAuthUserId } from "../../../utils/authHelpers";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { outJson } from "../../../utils/renders";
import {
  sendBadRequest,
  sendResult,
  sendServerError,
} from "../../utils/controllerHelpers";
import { featuresAuditTrailService } from "../services/auditTrailService";

function handle(res: Response, error: unknown, fallback: string): void {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return;
  }
  sendServerError(res, fallback);
}

export async function listAuditTrail(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const highRiskRaw = req.query.highRisk;
    const highRisk =
      highRiskRaw === undefined
        ? undefined
        : String(highRiskRaw).toLowerCase() === "true";
    const data = await featuresAuditTrailService.list(getAuthUserId(req), {
      clientId: req.query.clientId
        ? String(req.query.clientId)
        : undefined,
      type: req.query.type ? String(req.query.type) : undefined,
      highRisk,
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search ? String(req.query.search) : undefined,
    });
    sendResult(res, "Audit trail", data);
  } catch (error) {
    handle(res, error, "Failed to list audit trail");
  }
}

export async function reviewAuditTrail(
  req: IRequest,
  res: Response,
): Promise<void> {
  const note = String(req.body?.note ?? "").trim();
  if (!note) {
    sendBadRequest(res, "note is required");
    return;
  }
  try {
    const user = req.user;
    const reviewerName = user
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
        user.email ||
        "consultant"
      : "consultant";
    const data = await featuresAuditTrailService.review(
      getAuthUserId(req),
      String(req.params.id),
      note,
      reviewerName,
    );
    sendResult(res, "Audit item reviewed", data);
  } catch (error) {
    handle(res, error, "Failed to review audit item");
  }
}

export async function flagAuditTrail(
  req: IRequest,
  res: Response,
): Promise<void> {
  const note = String(req.body?.note ?? "").trim();
  if (!note) {
    sendBadRequest(res, "note is required");
    return;
  }
  try {
    const data = await featuresAuditTrailService.flag(
      getAuthUserId(req),
      String(req.params.id),
      note,
    );
    sendResult(res, "Audit item flagged", data);
  } catch (error) {
    handle(res, error, "Failed to flag audit item");
  }
}
