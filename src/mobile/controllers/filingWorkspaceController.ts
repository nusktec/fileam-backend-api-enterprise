import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import {
  normalizeWorkspaceTaxPath,
} from "../../constants/filingWorkspace";
import { filingWorkspaceService } from "../services/filingWorkspaceService";

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

function parsePeriodQuery(query: Record<string, unknown>): {
  periodYear?: number;
  periodMonth?: number;
} {
  const periodYear =
    query.periodYear != null ? Number(query.periodYear) : undefined;
  const periodMonth =
    query.periodMonth != null ? Number(query.periodMonth) : undefined;
  return {
    periodYear: Number.isFinite(periodYear) ? periodYear : undefined,
    periodMonth: Number.isFinite(periodMonth) ? periodMonth : undefined,
  };
}

function taxPathFromRequest(req: IRequest) {
  const segment = Array.isArray(req.params.taxType)
    ? req.params.taxType[0]
    : req.params.taxType;
  const path = normalizeWorkspaceTaxPath(segment ?? "");
  if (!path) {
    throw new HttpReplyError(
      400,
      "taxType must be vat, wht, pit, or cit.",
      null,
      "VALIDATION_ERROR",
    );
  }
  return path;
}

export const getFilingWorkspace = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const path = taxPathFromRequest(req);
    const period = parsePeriodQuery(req.query as Record<string, unknown>);
    const data = await filingWorkspaceService.getOrCreate(userId, path, period);
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to get workspace", error: "SERVER_ERROR" });
  }
};

export const updateFilingWorkspace = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const path = taxPathFromRequest(req);
    const data = await filingWorkspaceService.update(
      userId,
      path,
      req.body as Record<string, unknown>,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to update workspace", error: "SERVER_ERROR" });
  }
};

export const confirmFilingComputation = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const path = taxPathFromRequest(req);
    const body = req.body as { periodYear: number; periodMonth?: number };
    const data = await filingWorkspaceService.confirmComputation(
      userId,
      path,
      body,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to confirm computation", error: "SERVER_ERROR" });
  }
};

export const validateFilingWorkspace = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const path = taxPathFromRequest(req);
    const body = req.body as { periodYear: number; periodMonth?: number };
    const data = await filingWorkspaceService.validate(userId, path, body);
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to validate workspace", error: "SERVER_ERROR" });
  }
};

export const generateFilingDocuments = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const path = taxPathFromRequest(req);
    const body = req.body as { periodYear: number; periodMonth?: number };
    const data = await filingWorkspaceService.generateDocuments(
      userId,
      path,
      body,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to generate documents", error: "SERVER_ERROR" });
  }
};

export const getFilingWorkspaceDocument = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const path = taxPathFromRequest(req);
    const documentId = Array.isArray(req.params.documentId)
      ? req.params.documentId[0]
      : req.params.documentId;
    const period = parsePeriodQuery(req.query as Record<string, unknown>);
    const data = await filingWorkspaceService.getDocumentUrl(
      userId,
      path,
      documentId!,
      period,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to get document", error: "SERVER_ERROR" });
  }
};

export const getFilingWorkspacePackage = async (
  req: IRequest,
  res: Response,
) => {
  try {
    const userId = getAuthUserId(req);
    const path = taxPathFromRequest(req);
    const period = parsePeriodQuery(req.query as Record<string, unknown>);
    const data = await filingWorkspaceService.getPackage(userId, path, period);
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to get package", error: "SERVER_ERROR" });
  }
};

export const completeFiling = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await filingWorkspaceService.completeFiling(
      userId,
      id!,
      req.body as Record<string, unknown>,
    );
    res.status(200).json({ data });
  } catch (error) {
    if (replyError(res, error)) return;
    res.status(500).json({ message: "Failed to complete filing", error: "SERVER_ERROR" });
  }
};
