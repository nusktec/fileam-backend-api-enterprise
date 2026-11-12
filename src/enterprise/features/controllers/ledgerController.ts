import { Response } from "express";
import { IRequest } from "../../../interfaces/CustomRequest";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { outJson } from "../../../utils/renders";
import {
  sendBadRequest,
  sendNotFound,
  sendResult,
  sendServerError,
} from "../../utils/controllerHelpers";
import { featuresLedgerService } from "../services/ledgerService";

function parseYearMonth(req: IRequest): { year: number; month: number } | null {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export async function getLedger(req: IRequest, res: Response): Promise<void> {
  const clientUserId = req.linkedUserId!;
  const period = parseYearMonth(req);
  if (!period) {
    sendBadRequest(res, "year and month are required (month 1–12)");
    return;
  }
  try {
    const data = await featuresLedgerService.getLedger(
      clientUserId,
      period.year,
      period.month,
    );
    sendResult(res, "General ledger", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to fetch ledger");
  }
}

export async function getLedgerAccountEntries(
  req: IRequest,
  res: Response,
): Promise<void> {
  const clientUserId = req.linkedUserId!;
  const code = String(req.params.code ?? "").trim();
  const period = parseYearMonth(req);
  if (!code) {
    sendBadRequest(res, "account code is required");
    return;
  }
  if (!period) {
    sendBadRequest(res, "year and month are required (month 1–12)");
    return;
  }
  try {
    const data = await featuresLedgerService.getAccountEntries(
      clientUserId,
      code,
      period.year,
      period.month,
      req.query.page,
      req.query.limit,
    );
    if (!data) {
      sendNotFound(res, "Account not found");
      return;
    }
    sendResult(res, "Ledger account entries", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to fetch ledger account entries");
  }
}
