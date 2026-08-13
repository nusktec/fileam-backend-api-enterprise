import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import {
  liabilityRegisterService,
  liabilityRepaymentService,
} from "../services/liabilityRepaymentService";

function replyError(res: Response, error: unknown, fallback: string): boolean {
  if (error instanceof HttpReplyError) {
    res
      .status(error.statusCode)
      .json(
        outJson(false, error.message, error.data ?? null, error.errorCode),
      );
    return true;
  }
  return false;
}

function paramId(req: IRequest, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : v!;
}

export const createRegisteredLiability = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      name: string;
      liabilityType: string;
      creditor: string;
      principalAmount: number;
      interestRate: number;
      interestRateType: string;
      interestCalculationMethod: string;
      startDate: string;
      maturityDate: string;
      repaymentFrequency: string;
      repaymentStructure: string;
      note: string;
      evidenceUrl: string;
      bankName?: string;
      loanPurpose?: string;
      collateral?: string;
      propertyDescription?: string;
      propertyValue?: number;
      equipmentName?: string;
      equipmentValue?: number;
      serialNumber?: string;
      assetDescription?: string;
      leasePaymentAmount?: number;
      conversionTrigger?: string;
      conversionPrice?: string;
      conversionDate?: string;
    };
    const data = await liabilityRegisterService.create(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Liability created successfully.", data));
  } catch (error) {
    if (replyError(res, error, "Failed to register liability")) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to register liability", null));
  }
};

export const listRegisteredLiabilities = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const data = await liabilityRegisterService.list(userId, { page, limit });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Liabilities retrieved successfully.", data));
  } catch (error) {
    if (replyError(res, error, "Failed to list liabilities")) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list liabilities", null));
  }
};

export const getRegisteredLiability = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await liabilityRegisterService.getById(
      userId,
      paramId(req, "liabilityId"),
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Liability retrieved successfully.", data));
  } catch (error) {
    if (replyError(res, error, "Failed to get liability")) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get liability", null));
  }
};

export const createLiabilityRepayment = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      amount: number;
      paymentDate: string;
      paymentSource: string;
      evidenceUrl?: string;
    };
    const data = await liabilityRepaymentService.create(userId, {
      liabilityId: paramId(req, "liabilityId"),
      ...body,
    });
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Repayment recorded successfully.", data));
  } catch (error) {
    if (replyError(res, error, "Failed to create repayment")) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create repayment", null));
  }
};

export const listLiabilityRepayments = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const q = req.query;
    const str = (v: unknown): string | undefined => {
      if (typeof v === "string" && v.trim()) return v.trim();
      return undefined;
    };
    const data = await liabilityRepaymentService.listForLiability(
      userId,
      paramId(req, "liabilityId"),
      {
        page: q.page ? Number(q.page) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
        dateFrom: str(q.dateFrom),
        dateTo: str(q.dateTo),
        status: str(q.status),
        paymentSource: str(q.paymentSource),
        type: str(q.type),
      },
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Repayment history retrieved successfully.", data));
  } catch (error) {
    if (replyError(res, error, "Failed to list repayments")) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list repayments", null));
  }
};
