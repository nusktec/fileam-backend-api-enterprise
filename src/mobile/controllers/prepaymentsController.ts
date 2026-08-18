import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { prepaymentsService } from "../services/prepaymentsService";

function replyError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res
      .status(error.statusCode)
      .json(outJson(false, error.message, error.data ?? null, error.errorCode));
    return true;
  }
  return false;
}

function paramId(req: IRequest, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : v!;
}

export const createPrepayment = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      category: string;
      description: string;
      supplier: { id: string; name: string };
      totalAmount: number;
      paymentDate: string;
      serviceStartDate: string;
      serviceEndDate: string;
      recognitionFrequency: string;
      expenseType: string;
      evidenceUrl: string;
      customSchedule?: Array<{ recognitionDate: string; amount: number }>;
    };
    const data = await prepaymentsService.create(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Prepayment created successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create prepayment", null));
  }
};

export const listPrepayments = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const data = await prepaymentsService.list(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Prepayments retrieved successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list prepayments", null));
  }
};

export const getPrepayment = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const data = await prepaymentsService.getById(
      userId,
      paramId(req, "prepaymentId"),
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Prepayment retrieved successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get prepayment", null));
  }
};

export const updatePrepayment = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      category?: string;
      description?: string;
      supplier?: { id: string; name: string };
      serviceStartDate?: string;
      serviceEndDate?: string;
      recognitionFrequency?: string;
      expenseType?: string;
    };
    const data = await prepaymentsService.update(
      userId,
      paramId(req, "prepaymentId"),
      body,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Prepayment updated successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update prepayment", null));
  }
};

export const assignPrepaymentConsultant = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      consultantId: string;
      consultantName: string;
    };
    const data = await prepaymentsService.assignConsultant(
      userId,
      paramId(req, "prepaymentId"),
      body,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Consultant assigned successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to assign consultant", null));
  }
};

export const addPrepaymentEvidence = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      url: string;
    };
    const data = await prepaymentsService.addEvidence(
      userId,
      paramId(req, "prepaymentId"),
      body,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Evidence added successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add evidence", null));
  }
};

export const cancelPrepayment = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      reason: string;
    };
    const data = await prepaymentsService.cancel(
      userId,
      paramId(req, "prepaymentId"),
      body,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Prepayment cancelled successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to cancel prepayment", null));
  }
};
