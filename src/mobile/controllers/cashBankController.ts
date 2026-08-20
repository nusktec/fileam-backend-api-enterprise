import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { cashBankService } from "../services/cashBankService";
import type { CashType, OpeningBalanceSource } from "../../constants/cashBank";

function replyError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return true;
  }
  return false;
}

export const createCashBalance = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as { cashType: CashType; amount: number; note?: string };
    const data = await cashBankService.createCash(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Cash balance added successfully", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add cash balance", null));
  }
};

export const createBankAccount = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      bankName: string;
      accountName: string;
      accountNumber: string;
      accountType: string;
      accountPurpose: string;
      sourceOfOpeningBalance?: OpeningBalanceSource;
      openingBalance: number;
      balanceDate: string;
    };
    const data = await cashBankService.createBankAccount(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Bank account added successfully", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add bank account", null));
  }
};
