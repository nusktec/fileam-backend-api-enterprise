import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { enterpriseEvidenceVaultService } from "../services/enterpriseEvidenceVaultService";

export async function getCategories(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const categories = await enterpriseEvidenceVaultService.getCategoriesWithCounts(companyId);
    if (!categories) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Document categories", categories));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get categories", null));
  }
}

export async function getRecentDocuments(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const list = await enterpriseEvidenceVaultService.getRecentDocuments(companyId, limit);
    if (!list) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Recent documents", list));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get recent documents", null));
  }
}

export async function getStorageUsage(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const usage = await enterpriseEvidenceVaultService.getStorageUsage(companyId);
    if (!usage) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Storage usage", usage));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get storage usage", null));
  }
}

export async function listDocuments(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const search = req.query.search as string | undefined;
  const category = req.query.category as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const status = req.query.status as string | undefined;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const list = await enterpriseEvidenceVaultService.listDocuments(companyId, {
      search,
      category,
      startDate,
      endDate,
      status,
    });
    if (!list) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Documents", list));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to list documents", null));
  }
}

export async function getDocument(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const documentId = req.params.documentId;
  if (!companyId || !documentId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and documentId required", null));
    return;
  }
  try {
    const doc = await enterpriseEvidenceVaultService.getDocument(companyId, documentId);
    if (!doc) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Document", doc));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get document", null));
  }
}

export async function getApprovers(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const approvers = await enterpriseEvidenceVaultService.getApprovers(companyId);
    res.status(HttpStatusCode.OK).json(outJson(true, "Approvers", approvers));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get approvers", null));
  }
}

export async function approveDocument(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const documentId = req.params.documentId;
  const approverId = req.body?.approverId != null ? String(req.body.approverId).trim() : "";
  const notes = req.body?.notes != null ? String(req.body.notes).trim() : undefined;
  if (!companyId || !documentId || !approverId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId, documentId, approverId required", null));
    return;
  }
  try {
    const doc = await enterpriseEvidenceVaultService.approveDocument(companyId, documentId, approverId, notes);
    if (!doc) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Document approved", doc));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to approve document", null));
  }
}

export async function rejectDocument(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const documentId = req.params.documentId;
  const notes = req.body?.notes != null ? String(req.body.notes).trim() : undefined;
  if (!companyId || !documentId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and documentId required", null));
    return;
  }
  try {
    const doc = await enterpriseEvidenceVaultService.rejectDocument(companyId, documentId, notes);
    if (!doc) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Document rejected", doc));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to reject document", null));
  }
}

export async function getDocumentDownload(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const documentId = req.params.documentId;
  if (!companyId || !documentId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and documentId required", null));
    return;
  }
  try {
    const doc = await enterpriseEvidenceVaultService.getDocument(companyId, documentId);
    if (!doc) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Download URL", {
      downloadUrl: doc.fileUrl ?? null,
      documentName: doc.documentName,
    }));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get download", null));
  }
}

export async function updateDocumentDetails(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const documentId = req.params.documentId;
  const body = req.body || {};
  const documentName = body.documentName != null ? String(body.documentName).trim() : undefined;
  const category = body.category != null ? String(body.category).trim() : undefined;
  const documentDate = body.documentDate ? new Date(body.documentDate) : undefined;
  const description = body.description != null ? String(body.description).trim() : undefined;
  if (!companyId || !documentId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and documentId required", null));
    return;
  }
  try {
    const doc = await enterpriseEvidenceVaultService.updateDocumentDetails(companyId, documentId, {
      documentName,
      category,
      documentDate,
      description,
    });
    if (!doc) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Document details updated", doc));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to update document", null));
  }
}

export async function getSignatureReport(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const documentId = req.params.documentId;
  if (!companyId || !documentId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and documentId required", null));
    return;
  }
  try {
    const report = await enterpriseEvidenceVaultService.getSignatureReport(companyId, documentId);
    if (!report) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Signature report", report));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get signature report", null));
  }
}

export async function getDocumentOriginal(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const documentId = req.params.documentId;
  if (!companyId || !documentId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and documentId required", null));
    return;
  }
  try {
    const doc = await enterpriseEvidenceVaultService.getDocument(companyId, documentId);
    if (!doc) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Original document URL", {
      url: doc.fileUrl ?? null,
      documentName: doc.documentName,
    }));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get original document", null));
  }
}

export async function getDocumentCategories(_req: IRequest, res: Response): Promise<void> {
  try {
    const categories = enterpriseEvidenceVaultService.getCategories();
    res.status(HttpStatusCode.OK).json(outJson(true, "Document categories", categories));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get categories", null));
  }
}

export async function getDocumentStatuses(_req: IRequest, res: Response): Promise<void> {
  try {
    const statuses = enterpriseEvidenceVaultService.getStatuses();
    res.status(HttpStatusCode.OK).json(outJson(true, "Document statuses", statuses));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get statuses", null));
  }
}

export async function uploadDocument(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const body = req.body || {};
  const documentName = body.documentName != null ? String(body.documentName).trim() : "";
  const category = body.category != null ? String(body.category).trim() : "";
  const documentDate = body.documentDate ? new Date(body.documentDate) : new Date();
  const description = body.description != null ? String(body.description).trim() : undefined;
  const fileUrl = body.fileUrl ?? (req.file ? (req as unknown as { file: { path: string } }).file?.path : undefined);
  const fileSizeKb = body.fileSizeKb != null ? Number(body.fileSizeKb) : undefined;
  const uploaderId = body.uploaderId != null ? String(body.uploaderId).trim() : undefined;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  if (!documentName || !category) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "documentName and category required", null));
    return;
  }
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
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.CREATED).json(outJson(true, "Document uploaded", doc));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to upload document", null));
  }
}

export async function getDocumentPreview(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const documentId = req.params.documentId;
  if (!companyId || !documentId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and documentId required", null));
    return;
  }
  try {
    const result = await enterpriseEvidenceVaultService.getDocumentPreviewUrl(companyId, documentId);
    if (!result) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Document preview", result));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get preview", null));
  }
}

export async function signDocument(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const documentId = req.params.documentId;
  const body = req.body || {};
  const signedBy = body.signedBy != null ? String(body.signedBy).trim() : "";
  const signerEmail = body.signerEmail != null ? String(body.signerEmail).trim() : "";
  const ipAddress = body.ipAddress != null ? String(body.ipAddress).trim() : "";
  const signatureMethod = body.signatureMethod != null ? String(body.signatureMethod).trim() : "Electronic Signature";
  const documentHash = body.documentHash != null ? String(body.documentHash).trim() : "";
  const signatureData = body.signatureData != null ? String(body.signatureData) : undefined;
  if (!companyId || !documentId || !signedBy || !signerEmail) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId, documentId, signedBy, signerEmail required", null));
    return;
  }
  try {
    const sig = await enterpriseEvidenceVaultService.signDocument(companyId, documentId, {
      signedBy,
      signerEmail,
      ipAddress,
      signatureMethod,
      documentHash: documentHash || "stub-hash",
      signatureData,
    });
    if (!sig) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Document signed", sig));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to sign document", null));
  }
}
