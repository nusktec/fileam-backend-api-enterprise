import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { PaginationRequest } from "../../middlewares/paginationMiddleware";
import { HttpReplyError } from "../../utils/httpReplyError";
import { assetReviewsService } from "../services/assetReviewsService";
import { assetReportsService } from "../services/assetReportsService";

function paramId(req: IRequest): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  return id!;
}

function paramReportType(req: IRequest): string {
  const t = Array.isArray(req.params.reportType)
    ? req.params.reportType[0]
    : req.params.reportType;
  return t!;
}

function replyHttpError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return true;
  }
  return false;
}

function parseOptionalDate(raw: unknown): Date | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new HttpReplyError(400, "Dates must be YYYY-MM-DD");
  }
  return new Date(`${s}T12:00:00.000Z`);
}

export const listAssetReviews = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const p = (req as PaginationRequest).pagination;
    const data = await assetReviewsService.listReviews(userId, {
      page: p?.page,
      limit: p?.limit,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset reviews retrieved successfully.", data));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load asset reviews", null));
  }
};

export const getAssetReview = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await assetReviewsService.getReviewDetail(userId, paramId(req));
    if (!data) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Asset review not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset review retrieved successfully.", data));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load asset review", null));
  }
};

export const uploadAssetEvidence = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const data = await assetReviewsService.uploadEvidence(
      userId,
      paramId(req),
      files,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Evidence uploaded successfully.", data));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to upload evidence", null));
  }
};

export const assignAssetConsultant = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const consultantId = String(req.body?.consultantId ?? "").trim();
    if (!consultantId) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "consultantId is required", null));
      return;
    }
    const data = await assetReviewsService.assignConsultant(
      userId,
      paramId(req),
      consultantId,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Consultant assigned successfully.", data));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to assign consultant", null));
  }
};

export const confirmAssetReview = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await assetReviewsService.confirmReview(userId, paramId(req));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Review confirmed successfully.", data));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to confirm review", null));
  }
};

export const approveAssetReview = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await assetReviewsService.approveReview(userId, paramId(req));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Review approved successfully.", data));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to approve review", null));
  }
};

export const listAssetReviewConsultants = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await assetReviewsService.listConsultants(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Consultants retrieved successfully.", data));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load consultants", null));
  }
};

export const listAllAssetHistory = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const p = (req as PaginationRequest).pagination;
    const q = req.query ?? {};
    const data = await assetReviewsService.listAllHistory(userId, {
      page: p?.page,
      limit: p?.limit,
      assetType: q.assetType != null ? String(q.assetType) : undefined,
      type: q.type != null ? String(q.type) : undefined,
      assetId: q.assetId != null ? String(q.assetId) : undefined,
      dateFrom: parseOptionalDate(q.dateFrom ?? q.startDate),
      dateTo: parseOptionalDate(q.dateTo ?? q.endDate),
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Asset history retrieved successfully.", data));
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load asset history", null));
  }
};

export const downloadAssetReport = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const q = req.query ?? {};
    const result = await assetReportsService.generatePdf(
      userId,
      paramReportType(req),
      {
        startDate: parseOptionalDate(q.startDate ?? q.dateFrom),
        endDate: parseOptionalDate(q.endDate ?? q.dateTo),
        assetType: q.assetType != null ? String(q.assetType) : undefined,
      },
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    res.status(HttpStatusCode.OK).send(result.buffer);
  } catch (error) {
    if (replyHttpError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to generate asset report", null));
  }
};
