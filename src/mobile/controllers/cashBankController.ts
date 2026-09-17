import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { cashBankService } from "../services/cashBankService";
import { currentAssetUndoService } from "../services/currentAssetUndoService";
import type { CashType, OpeningBalanceSource } from "../../constants/cashBank";
import type {
  AssetBankUndoReason,
  AssetCashUndoReason,
} from "../../constants/recordUndo";

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

function paramId(req: IRequest): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  return id!;
}

export const getCashUndoCheck = async (req: IRequest, res: Response) => {
  try {
    const result = await currentAssetUndoService.getCashUndoCheck(
      getAuthUserId(req),
      paramId(req),
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Cash record not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Cash undo check", result));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to check cash undo", null));
  }
};

export const undoCashBalance = async (req: IRequest, res: Response) => {
  try {
    const body = matchedData(req, { locations: ["body"] }) as { reason: string };
    const result = await currentAssetUndoService.undoCash(
      getAuthUserId(req),
      paramId(req),
      body.reason as AssetCashUndoReason,
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Cash record not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Cash undone", result));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to undo cash", null));
  }
};

export const getBankAccountUndoCheck = async (req: IRequest, res: Response) => {
  try {
    const result = await currentAssetUndoService.getBankUndoCheck(
      getAuthUserId(req),
      paramId(req),
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Bank account not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Bank account undo check", result));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to check bank account undo", null));
  }
};

export const undoBankAccount = async (req: IRequest, res: Response) => {
  try {
    const body = matchedData(req, { locations: ["body"] }) as { reason: string };
    const result = await currentAssetUndoService.undoBank(
      getAuthUserId(req),
      paramId(req),
      body.reason as AssetBankUndoReason,
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Bank account not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Bank account undone", result));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to undo bank account", null));
  }
};
