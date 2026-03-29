import { Response } from "express";
import { matchedData } from "express-validator";
import { IRequest } from "../../interfaces/CustomRequest";
import { getParam } from "../utils/paramHelpers";
import {
  sendNotFound,
  sendResult,
  sendCreated,
  sendServerError,
} from "../utils/controllerHelpers";
import { sendPaginated } from "../../utils/responseHelpers";
import { enterpriseEvidenceVaultService } from "../services/enterpriseEvidenceVaultService";

export async function getStats(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  try {
    const stats = await enterpriseEvidenceVaultService.getStats(
      companyId,
      req.linkedUserId,
    );
    if (!stats) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Evidence vault stats", stats);
  } catch {
    sendServerError(res, "Failed to get stats");
  }
}

export async function getCategories(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  try {
    const categories =
      await enterpriseEvidenceVaultService.getCategoriesWithCounts(
        companyId,
        req.linkedUserId,
      );
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
  const companyId = req.companyId!;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  try {
    const list = await enterpriseEvidenceVaultService.getRecentDocuments(
      companyId,
      limit,
      req.linkedUserId,
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
  const companyId = req.companyId!;
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
  const companyId = req.companyId!;
  const search = req.query.search as string | undefined;
  const category = req.query.category as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const status = req.query.status as string | undefined;
  const pagination = req.pagination;
  try {
    const result = await enterpriseEvidenceVaultService.listDocuments(
      companyId,
      {
        search,
        category,
        startDate,
        endDate,
        status,
        dateFrom: pagination?.dateFrom,
        dateTo: pagination?.dateTo,
      },
      {
        page: pagination?.page,
        limit: pagination?.limit,
        sortOrder: pagination?.sortOrder,
      },
      req.linkedUserId,
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
  const companyId = req.companyId!;
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

export async function deleteDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  try {
    const result = await enterpriseEvidenceVaultService.deleteDocument(
      companyId,
      documentId,
    );
    if (!result) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Document deleted", result);
  } catch {
    sendServerError(res, "Failed to delete document");
  }
}

export async function getApprovers(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
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
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  const data = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
    approverId: string;
    notes?: string;
  };
  try {
    const doc = await enterpriseEvidenceVaultService.approveDocument(
      companyId,
      documentId,
      data.approverId,
      data.notes,
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
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  const data = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
    notes?: string;
  };
  try {
    const doc = await enterpriseEvidenceVaultService.rejectDocument(
      companyId,
      documentId,
      data.notes,
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
  const companyId = req.companyId!;
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
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  const data = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
    documentName?: string;
    category?: string;
    documentDate?: string;
    description?: string;
  };
  const documentDate = data.documentDate ? new Date(data.documentDate) : undefined;
  try {
    const doc = await enterpriseEvidenceVaultService.updateDocumentDetails(
      companyId,
      documentId,
      {
        documentName: data.documentName,
        category: data.category,
        documentDate,
        description: data.description,
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
  const companyId = req.companyId!;
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
  const companyId = req.companyId!;
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
  const companyId = req.companyId!;
  const data = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
    documentName: string;
    category: string;
    documentDate?: string;
    description?: string;
    fileUrl?: string;
    fileSizeKb?: number;
    uploaderId?: string;
  };
  const documentDate = data.documentDate ? new Date(data.documentDate) : new Date();
  try {
    const doc = await enterpriseEvidenceVaultService.uploadDocument(companyId, {
      documentName: data.documentName,
      category: data.category,
      documentDate,
      description: data.description,
      fileUrl: data.fileUrl?.trim() || undefined,
      fileSizeKb: data.fileSizeKb,
      uploaderId: data.uploaderId,
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
  const companyId = req.companyId!;
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
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  const data = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
    signedBy: string;
    signerEmail: string;
    ipAddress?: string;
    signatureMethod?: string;
    documentHash?: string;
    signatureData?: string;
  };
  try {
    const sig = await enterpriseEvidenceVaultService.signDocument(
      companyId,
      documentId,
      {
        signedBy: data.signedBy,
        signerEmail: data.signerEmail,
        ipAddress: data.ipAddress ?? "",
        signatureMethod: data.signatureMethod ?? "Electronic Signature",
        documentHash: (data.documentHash ?? "").trim() || "stub-hash",
        signatureData: data.signatureData,
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

export async function getInvoiceExtractionPreview(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  try {
    const preview =
      await enterpriseEvidenceVaultService.mockInvoiceExtractionPreview(
        companyId,
        documentId,
      );
    if (!preview) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Mock invoice extraction (preview)", preview);
  } catch {
    sendServerError(res, "Failed to build extraction preview");
  }
}

export async function convertToInvoice(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  const data = matchedData(req, { locations: ["body"] }) as {
    clientName: string;
    clientAddress: string;
    clientEmail: string;
    totalAmount: number;
  };
  try {
    const invoice = await enterpriseEvidenceVaultService.convertToInvoice(
      companyId,
      documentId,
      {
        clientName: data.clientName,
        clientAddress: data.clientAddress,
        clientEmail: data.clientEmail,
        totalAmount: Number(data.totalAmount),
      },
    );
    if (!invoice) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendCreated(res, "Invoice created from document", invoice);
  } catch {
    sendServerError(res, "Failed to convert to invoice");
  }
}
