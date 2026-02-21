import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { getParam } from "../utils/paramHelpers";
import {
  requireCompanyId,
  sendNotFound,
  sendResult,
  sendCreated,
  sendServerError,
} from "../utils/controllerHelpers";
import { sendPaginated } from "../../utils/responseHelpers";
import { enterpriseEvidenceVaultService } from "../services/enterpriseEvidenceVaultService";

export async function getCategories(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  try {
    const categories =
      await enterpriseEvidenceVaultService.getCategoriesWithCounts(companyId);
    if (!categories) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Document categories", categories);
  } catch {
    sendServerError(res, "Failed to get categories");
  }
}

export async function getRecentDocuments(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  try {
    const list = await enterpriseEvidenceVaultService.getRecentDocuments(
      companyId,
      limit,
    );
    if (!list) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Recent documents", list);
  } catch {
    sendServerError(res, "Failed to get recent documents");
  }
}

export async function getStorageUsage(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  try {
    const usage =
      await enterpriseEvidenceVaultService.getStorageUsage(companyId);
    if (!usage) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Storage usage", usage);
  } catch {
    sendServerError(res, "Failed to get storage usage");
  }
}

export async function listDocuments(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const search = req.query.search as string | undefined;
  const category = req.query.category as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const status = req.query.status as string | undefined;
  const pagination = req.pagination;
  try {
    const result = await enterpriseEvidenceVaultService.listDocuments(
      companyId,
      { search, category, startDate, endDate, status },
      {
        page: pagination?.page,
        limit: pagination?.limit,
        sortOrder: pagination?.sortOrder,
      },
    );
    if (!result) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendPaginated(
      res,
      "Documents",
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  } catch {
    sendServerError(res, "Failed to list documents");
  }
}

export async function getDocument(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const documentId = getParam(req.params, "documentId");
  try {
    const doc = await enterpriseEvidenceVaultService.getDocument(
      companyId,
      documentId,
    );
    if (!doc) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Document", doc);
  } catch {
    sendServerError(res, "Failed to get document");
  }
}

export async function getApprovers(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  try {
    const approvers =
      await enterpriseEvidenceVaultService.getApprovers(companyId);
    sendResult(res, "Approvers", approvers);
  } catch {
    sendServerError(res, "Failed to get approvers");
  }
}

export async function approveDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const documentId = getParam(req.params, "documentId");
  const approverId =
    req.body?.approverId != null ? String(req.body.approverId).trim() : "";
  const notes =
    req.body?.notes != null ? String(req.body.notes).trim() : undefined;
  try {
    const doc = await enterpriseEvidenceVaultService.approveDocument(
      companyId,
      documentId,
      approverId,
      notes,
    );
    if (!doc) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Document approved", doc);
  } catch {
    sendServerError(res, "Failed to approve document");
  }
}

export async function rejectDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const documentId = getParam(req.params, "documentId");
  const notes =
    req.body?.notes != null ? String(req.body.notes).trim() : undefined;
  try {
    const doc = await enterpriseEvidenceVaultService.rejectDocument(
      companyId,
      documentId,
      notes,
    );
    if (!doc) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Document rejected", doc);
  } catch {
    sendServerError(res, "Failed to reject document");
  }
}

export async function getDocumentDownload(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const documentId = getParam(req.params, "documentId");
  try {
    const doc = await enterpriseEvidenceVaultService.getDocument(
      companyId,
      documentId,
    );
    if (!doc) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Download URL", {
      downloadUrl: doc.fileUrl ?? null,
      documentName: doc.documentName,
    });
  } catch {
    sendServerError(res, "Failed to get download");
  }
}

export async function updateDocumentDetails(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const documentId = getParam(req.params, "documentId");
  const body = req.body || {};
  const documentName =
    body.documentName != null ? String(body.documentName).trim() : undefined;
  const category =
    body.category != null ? String(body.category).trim() : undefined;
  const documentDate = body.documentDate
    ? new Date(body.documentDate)
    : undefined;
  const description =
    body.description != null ? String(body.description).trim() : undefined;
  try {
    const doc = await enterpriseEvidenceVaultService.updateDocumentDetails(
      companyId,
      documentId,
      {
        documentName,
        category,
        documentDate,
        description,
      },
    );
    if (!doc) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Document details updated", doc);
  } catch {
    sendServerError(res, "Failed to update document");
  }
}

export async function getSignatureReport(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const documentId = getParam(req.params, "documentId");
  try {
    const report = await enterpriseEvidenceVaultService.getSignatureReport(
      companyId,
      documentId,
    );
    if (!report) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Signature report", report);
  } catch {
    sendServerError(res, "Failed to get signature report");
  }
}

export async function getDocumentOriginal(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const documentId = getParam(req.params, "documentId");
  try {
    const doc = await enterpriseEvidenceVaultService.getDocument(
      companyId,
      documentId,
    );
    if (!doc) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Original document URL", {
      url: doc.fileUrl ?? null,
      documentName: doc.documentName,
    });
  } catch {
    sendServerError(res, "Failed to get original document");
  }
}

export async function getDocumentCategories(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const categories = enterpriseEvidenceVaultService.getCategories();
    sendResult(res, "Document categories", categories);
  } catch {
    sendServerError(res, "Failed to get categories");
  }
}

export async function getDocumentStatuses(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const statuses = enterpriseEvidenceVaultService.getStatuses();
    sendResult(res, "Document statuses", statuses);
  } catch {
    sendServerError(res, "Failed to get statuses");
  }
}

export async function uploadDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const body = req.body as Record<string, unknown>;
  const documentName = body.documentName != null ? String(body.documentName).trim() : "";
  const category = body.category != null ? String(body.category).trim() : "";
  const documentDate = body.documentDate ? new Date(body.documentDate as string) : new Date();
  const description = body.description != null ? String(body.description).trim() : undefined;
  const fileUrl = body.fileUrl != null ? String(body.fileUrl).trim() || undefined : undefined;
  const fileSizeKb = body.fileSizeKb != null ? Number(body.fileSizeKb) : undefined;
  const uploaderId = body.uploaderId != null ? String(body.uploaderId).trim() : undefined;
  try {
    const doc = await enterpriseEvidenceVaultService.uploadDocument(companyId, {
      documentName,
      category,
      documentDate,
      description,
      fileUrl,
      fileSizeKb,
      uploaderId,
    });
    if (!doc) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendCreated(res, "Document uploaded", doc);
  } catch {
    sendServerError(res, "Failed to upload document");
  }
}

export async function getDocumentPreview(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const documentId = getParam(req.params, "documentId");
  try {
    const result = await enterpriseEvidenceVaultService.getDocumentPreviewUrl(
      companyId,
      documentId,
    );
    if (!result) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Document preview", result);
  } catch {
    sendServerError(res, "Failed to get preview");
  }
}

export async function signDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const documentId = getParam(req.params, "documentId");
  const body = req.body || {};
  const signedBy = body.signedBy != null ? String(body.signedBy).trim() : "";
  const signerEmail =
    body.signerEmail != null ? String(body.signerEmail).trim() : "";
  const ipAddress = body.ipAddress != null ? String(body.ipAddress).trim() : "";
  const signatureMethod =
    body.signatureMethod != null
      ? String(body.signatureMethod).trim()
      : "Electronic Signature";
  const documentHash =
    body.documentHash != null ? String(body.documentHash).trim() : "";
  const signatureData =
    body.signatureData != null ? String(body.signatureData) : undefined;
  try {
    const sig = await enterpriseEvidenceVaultService.signDocument(
      companyId,
      documentId,
      {
        signedBy,
        signerEmail,
        ipAddress,
        signatureMethod,
        documentHash: documentHash || "stub-hash",
        signatureData,
      },
    );
    if (!sig) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Document signed", sig);
  } catch {
    sendServerError(res, "Failed to sign document");
  }
}
