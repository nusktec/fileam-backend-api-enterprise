import { Response } from "express";
import { matchedData, validationResult } from "express-validator";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { beneficiariesService } from "../services/beneficiariesService";
import type { BeneficiaryDocumentKind, BeneficiaryListFilter } from "../../constants/beneficiary";

function paramId(req: IRequest, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : v!;
}

function ensureValid(req: IRequest) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpReplyError(422, "Validation failed", errors.array(), "VALIDATION_ERROR");
  }
}

function replyError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json({
      message: error.message,
      error: error.errorCode ?? "VALIDATION_ERROR",
      ...(error.data ? { details: error.data } : {}),
    });
    return true;
  }
  return false;
}

export const listBeneficiaries = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const query = matchedData(req, {
      locations: ["query"],
      includeOptionals: true,
    }) as {
      type?: BeneficiaryListFilter;
      search?: string;
      page?: number;
      limit?: number;
    };
    const data = await beneficiariesService.list(userId, query);
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to list beneficiaries", error: "SERVER_ERROR" });
  }
};

export const createBeneficiary = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true });
    const data = await beneficiariesService.create(userId, body as Record<string, unknown>);
    res.status(201).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to create beneficiary", error: "SERVER_ERROR" });
  }
};

export const getBeneficiary = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const data = await beneficiariesService.getById(userId, paramId(req, "id"));
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to get beneficiary", error: "SERVER_ERROR" });
  }
};

export const updateBeneficiary = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true });
    const data = await beneficiariesService.update(
      userId,
      paramId(req, "id"),
      body as Record<string, unknown>,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to update beneficiary", error: "SERVER_ERROR" });
  }
};

export const createBeneficiaryTransaction = async (
  req: IRequest,
  res: Response,
) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true });
    const data = await beneficiariesService.createTransaction(
      userId,
      paramId(req, "id"),
      body as Record<string, unknown>,
    );
    res.status(201).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to record transaction", error: "SERVER_ERROR" });
  }
};

export const remitBeneficiaryWht = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      remittedAt?: string;
      receiptUrl?: string;
    };
    const data = await beneficiariesService.remitWht(
      userId,
      paramId(req, "id"),
      paramId(req, "transactionId"),
      body,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to remit WHT", error: "SERVER_ERROR" });
  }
};

export const createBeneficiaryDocument = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      title: string;
      kind: BeneficiaryDocumentKind;
      url: string;
      date?: string;
    };
    const data = await beneficiariesService.createDocument(
      userId,
      paramId(req, "id"),
      body,
    );
    res.status(201).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to attach document", error: "SERVER_ERROR" });
  }
};
