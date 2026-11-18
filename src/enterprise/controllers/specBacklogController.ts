import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { HttpReplyError } from "../../utils/httpReplyError";
import { outJson } from "../../utils/renders";
import {
  sendBadRequest,
  sendNotFound,
  sendResult,
  sendServerError,
} from "../utils/controllerHelpers";
import { specBacklogService } from "../services/specBacklogService";

function clientUserId(req: IRequest): string | null {
  return req.linkedUserId ?? null;
}

export async function getProfitabilityOverview(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = clientUserId(req);
  if (!userId) {
    sendBadRequest(res, "Linked client required");
    return;
  }
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const data = await specBacklogService.profitabilityOverview(userId, year);
    sendResult(res, "Profitability overview", data);
  } catch {
    sendServerError(res, "Failed to get profitability overview");
  }
}

export async function simulateProfitability(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = clientUserId(req);
  if (!userId) {
    sendBadRequest(res, "Linked client required");
    return;
  }
  try {
    const data = await specBacklogService.simulateProfitability(
      userId,
      req.body ?? {},
    );
    sendResult(res, "Profitability simulation", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to simulate profitability");
  }
}

export async function getFilingSteps(req: IRequest, res: Response): Promise<void> {
  const userId = clientUserId(req);
  if (!userId) {
    sendBadRequest(res, "Linked client required");
    return;
  }
  try {
    const data = await specBacklogService.filingSteps(
      userId,
      String(req.params.filingId),
    );
    if (!data) {
      sendNotFound(res, "Filing not found");
      return;
    }
    sendResult(res, "Filing steps", data);
  } catch {
    sendServerError(res, "Failed to get filing steps");
  }
}

export async function patchFilingStep(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = clientUserId(req);
  if (!userId) {
    sendBadRequest(res, "Linked client required");
    return;
  }
  try {
    const reviewer = req.user
      ? `${req.user.firstName ?? ""} ${req.user.lastName ?? ""}`.trim() ||
        "consultant"
      : "consultant";
    const data = await specBacklogService.updateFilingStep(
      userId,
      String(req.params.filingId),
      Number(req.params.stepId),
      req.body ?? {},
      reviewer,
    );
    if (!data) {
      sendNotFound(res, "Filing not found");
      return;
    }
    sendResult(res, "Filing step updated", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to update filing step");
  }
}

export async function classifyBankStatement(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = clientUserId(req);
  if (!userId) {
    sendBadRequest(res, "Linked client required");
    return;
  }
  const analysisId = String(req.body?.analysisId ?? "").trim();
  if (!analysisId) {
    sendBadRequest(res, "analysisId is required");
    return;
  }
  try {
    const data = await specBacklogService.classifyBankStatement(
      userId,
      analysisId,
    );
    if (!data) {
      sendNotFound(res, "Bank statement analysis not found");
      return;
    }
    sendResult(res, "Bank statement analysis", data);
  } catch {
    sendServerError(res, "Failed to classify bank statement");
  }
}
