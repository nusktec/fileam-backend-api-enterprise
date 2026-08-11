import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { evidenceVaultService } from "../services/evidenceVaultService";
import { parseDateRangeQuery } from "../../utils/dateRangeQuery";
import { HttpReplyError } from "../../utils/httpReplyError";

function replyVaultError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return true;
  }
  return false;
}

export const listDocuments = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const dr = parseDateRangeQuery(req.query as Record<string, unknown>);
    if (!dr.ok) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, dr.message, null));
      return;
    }
    const [documents, counts] = await Promise.all([
      evidenceVaultService.listDocuments(userId, {
        search,
        category,
        dateFrom: dr.range.dateFrom,
        dateTo: dr.range.dateTo,
      }),
      evidenceVaultService.getCategoryCounts(userId),
    ]);
    res.status(HttpStatusCode.OK).json(
      outJson(true, "Documents retrieved", {
        totalDocuments: documents.length,
        documents,
        categoryCounts: counts,
      }),
    );
  } catch (error) {
    if (replyVaultError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve documents", null));
  }
};

export const createDocument = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"] }) as {
      url: string;
      category: string;
      linkedRecord: string;
      uploadedDate?: string;
      name?: string;
      fileSizeKb?: number;
    };
    const doc = await evidenceVaultService.createDocument(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Document created", doc));
  } catch (error) {
    if (replyVaultError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create document", null));
  }
};

export const listRecordsByCategory = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const category = Array.isArray(req.params.category)
      ? req.params.category[0]
      : req.params.category;
    const records = await evidenceVaultService.listRecordsByCategory(
      userId,
      category!,
    );
    res.status(HttpStatusCode.OK).json(
      outJson(true, "Records retrieved successfully", {
        records,
      }),
    );
  } catch (error) {
    if (replyVaultError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve records", null));
  }
};

export const getDocumentById = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const doc = await evidenceVaultService.getDocumentById(userId, id!);
    if (!doc) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Document not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Document retrieved", doc));
  } catch (error) {
    if (replyVaultError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve document", null));
  }
};

export const getDocumentDownload = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const doc = await evidenceVaultService.getDocumentById(userId, id!);
    if (!doc) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Document not found", null));
      return;
    }

    const url = await evidenceVaultService.getDownloadUrl(userId, id!);
    if (url) {
      res.status(HttpStatusCode.OK).json(outJson(true, "Download URL", { url }));
      return;
    }

    if (evidenceVaultService.canGeneratePdf(id!)) {
      const { generatePdfForDocument } = await import(
        "../services/evidenceVaultPdfService"
      );
      const result = await generatePdfForDocument(userId, id!);
      if (result) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${result.filename}"`,
        );
        res.setHeader("Content-Length", result.buffer.length);
        res.status(HttpStatusCode.OK).send(result.buffer);
        return;
      }
    }

    res
      .status(HttpStatusCode.NOT_FOUND)
      .json(outJson(false, "Download not available for this document", null));
  } catch (error) {
    if (replyVaultError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get download", null));
  }
};
