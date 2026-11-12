import { Response } from "express";
import { IRequest } from "../../../interfaces/CustomRequest";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { outJson } from "../../../utils/renders";
import {
  sendBadRequest,
  sendResult,
  sendServerError,
} from "../../utils/controllerHelpers";
import { featuresTransactionsService } from "../services/transactionsService";

function handle(res: Response, error: unknown, fallback: string): void {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return;
  }
  sendServerError(res, fallback);
}

export async function listTransactions(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const data = await featuresTransactionsService.list(
      req.linkedUserId!,
      req.query.page,
      req.query.limit,
    );
    sendResult(res, "Transactions", data);
  } catch (error) {
    handle(res, error, "Failed to list transactions");
  }
}

export async function patchTransactionStage(
  req: IRequest,
  res: Response,
): Promise<void> {
  const stage = String(req.body?.stage ?? "").trim();
  if (!stage) {
    sendBadRequest(res, "stage is required");
    return;
  }
  try {
    const data = await featuresTransactionsService.advanceStage(
      req.linkedUserId!,
      String(req.params.id),
      stage,
    );
    sendResult(res, "Pipeline stage updated", data);
  } catch (error) {
    handle(res, error, "Failed to update pipeline stage");
  }
}
