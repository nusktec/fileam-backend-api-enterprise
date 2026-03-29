import { Response } from "express";
import { matchedData } from "express-validator";
import { IRequest } from "../../interfaces/CustomRequest";
import { getParam } from "../utils/paramHelpers";
import {
  sendNotFound,
  sendResult,
  sendCreated,
  sendServerError,
  sendBadRequest,
} from "../utils/controllerHelpers";
import { sendPaginated } from "../../utils/responseHelpers";
import { enterpriseFinancialsService } from "../services/enterpriseFinancialsService";

export async function getRecentTransactions(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  try {
    const list = await enterpriseFinancialsService.getRecentTransactions(
      companyId,
      limit,
      req.linkedUserId,
    );
    if (!list) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Recent transactions", list);
  } catch {
    sendServerError(res, "Failed to get transactions");
  }
}

export async function getAllTransactions(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const pagination = req.pagination;
  try {
    const result = await enterpriseFinancialsService.getAllTransactions(
      companyId,
      {
        page: pagination?.page,
        limit: pagination?.limit,
        sortOrder: pagination?.sortOrder,
        dateFrom: pagination?.dateFrom,
        dateTo: pagination?.dateTo,
      },
      req.linkedUserId,
    );
    if (!result) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendPaginated(
      res,
      "Transactions",
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  } catch {
    sendServerError(res, "Failed to get transactions");
  }
}

export async function getSummary(req: IRequest, res: Response): Promise<void> {
  const companyId = req.companyId!;
  try {
    const summary = await enterpriseFinancialsService.getSummary(
      companyId,
      req.linkedUserId,
    );
    if (!summary) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Financial summary", summary);
  } catch {
    sendServerError(res, "Failed to get summary");
  }
}

export async function getProfitTrend(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const year = req.query.year ? Number(req.query.year) : undefined;
  try {
    const data = await enterpriseFinancialsService.getProfitTrend(
      companyId,
      year,
      req.linkedUserId,
    );
    if (!data) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Profit trend", data);
  } catch {
    sendServerError(res, "Failed to get profit trend");
  }
}

export async function getProfitAndLoss(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const year = req.query.year ? Number(req.query.year) : undefined;
  const month = req.query.month ? Number(req.query.month) : undefined;
  try {
    const data = await enterpriseFinancialsService.getProfitAndLoss(
      companyId,
      year,
      month,
      req.linkedUserId,
    );
    if (!data) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Profit & Loss", data);
  } catch {
    sendServerError(res, "Failed to get profit & loss");
  }
}

export async function getBalanceSheet(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const year = req.query.year ? Number(req.query.year) : undefined;
  const month = req.query.month ? Number(req.query.month) : undefined;
  try {
    const data = await enterpriseFinancialsService.getBalanceSheet(
      companyId,
      year,
      month,
      req.linkedUserId,
    );
    if (!data) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Balance sheet", data);
  } catch {
    sendServerError(res, "Failed to get balance sheet");
  }
}

export async function getExpenseBreakdown(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const year = req.query.year ? Number(req.query.year) : undefined;
  try {
    const data = await enterpriseFinancialsService.getExpenseBreakdown(
      companyId,
      year,
      req.linkedUserId,
    );
    if (!data) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Expense breakdown", data);
  } catch {
    sendServerError(res, "Failed to get expense breakdown");
  }
}

export async function getMonthlyCashFlow(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const year = req.query.year ? Number(req.query.year) : undefined;
  try {
    const data = await enterpriseFinancialsService.getMonthlyCashFlow(
      companyId,
      year,
      req.linkedUserId,
    );
    if (!data) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Monthly cash flow", data);
  } catch {
    sendServerError(res, "Failed to get cash flow");
  }
}

export async function addTransaction(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const data = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
    description: string;
    date?: string;
    amount?: number;
    status?: string;
    type?: string;
    category?: string;
  };
  const date = data.date ? new Date(data.date) : new Date();
  try {
    const t = await enterpriseFinancialsService.addTransaction(
      companyId,
      {
        date,
        description: data.description,
        amount: Number(data.amount ?? 0),
        status: (data.status ?? "Pending").trim(),
        type: (data.type ?? "expense").trim(),
        category: data.category,
      },
      req.linkedUserId,
      req.user?.id,
    );
    if (!t) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendCreated(res, "Transaction added", t);
  } catch {
    sendServerError(res, "Failed to add transaction");
  }
}

export async function getDocumentTypes(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const types = enterpriseFinancialsService.getDocumentTypes();
    sendResult(res, "Document types", types);
  } catch {
    sendServerError(res, "Failed to get document types");
  }
}

export async function getCurrencies(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const currencies = enterpriseFinancialsService.getCurrencies();
    sendResult(res, "Currencies", currencies);
  } catch {
    sendServerError(res, "Failed to get currencies");
  }
}

export async function uploadDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const data = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
    documentType: string;
    description?: string;
    documentDate?: string;
    amount?: number;
    currency?: string;
    fileUrl?: string;
    invoiceId?: string;
  };
  const documentDate = data.documentDate ? new Date(data.documentDate) : new Date();
  try {
    const doc = await enterpriseFinancialsService.uploadDocument(companyId, {
      documentType: data.documentType,
      description: data.description,
      documentDate,
      amount: Number(data.amount ?? 0),
      currency: (data.currency ?? "USD").trim(),
      fileUrl: data.fileUrl?.trim() || undefined,
      invoiceId: data.invoiceId?.trim() || undefined,
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

export async function uploadInvoiceDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const data = (req.body || {}) as {
    fileUrl?: string;
    documentDate?: string;
    invoiceId?: string;
  };
  const fileUrl = data.fileUrl?.trim();
  if (!fileUrl) {
    sendBadRequest(res, "fileUrl is required");
    return;
  }
  try {
    const result = await enterpriseFinancialsService.uploadInvoiceDocument(
      companyId,
      {
        fileUrl,
        documentDate: data.documentDate ? new Date(data.documentDate) : undefined,
        invoiceId: data.invoiceId?.trim() || undefined,
      },
    );
    if (!result) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendCreated(res, "Invoice uploaded", result);
  } catch {
    sendServerError(res, "Failed to upload invoice");
  }
}

export async function ocrExtractDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const fileId = getParam(req.params, "fileId");
  try {
    const result = await enterpriseFinancialsService.mockOcrExtract(
      companyId,
      fileId,
    );
    if (!result) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendCreated(res, "OCR extraction completed (mock)", result);
  } catch {
    sendServerError(res, "Failed to extract OCR");
  }
}

export async function vendorIdentifyDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const extractionId = getParam(req.params, "extractionId");
  try {
    const result = await enterpriseFinancialsService.mockVendorIdentify(
      companyId,
      extractionId,
    );
    sendCreated(res, "Vendor identified (mock)", result);
  } catch {
    sendServerError(res, "Failed to identify vendor");
  }
}

export async function analyzeDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const vendorId = getParam(req.params, "vendorId");
  try {
    const result = await enterpriseFinancialsService.mockAnalyze(
      companyId,
      vendorId,
    );
    sendResult(res, "Analysis complete (mock)", result);
  } catch {
    sendServerError(res, "Failed to analyze document");
  }
}

export async function getDocumentReview(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  try {
    const result = await enterpriseFinancialsService.getDocumentReview(
      companyId,
      documentId,
    );
    if (!result) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Document review", result);
  } catch {
    sendServerError(res, "Failed to get document review");
  }
}

export async function deleteDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  try {
    const result = await enterpriseFinancialsService.deleteDocument(
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

export async function getDocumentStatus(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  try {
    const status = await enterpriseFinancialsService.getDocumentStatus(
      companyId,
      documentId,
    );
    if (!status) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Document status", status);
  } catch {
    sendServerError(res, "Failed to get document status");
  }
}

export async function getFinancialDocumentStats(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  try {
    const stats =
      await enterpriseFinancialsService.getFinancialDocumentStats(companyId);
    if (!stats) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Document stats", stats);
  } catch {
    sendServerError(res, "Failed to get document stats");
  }
}

export async function listFinancialDocuments(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const pagination = req.pagination;
  const documentStatus = req.query.documentStatus as string | undefined;
  try {
    const result =
      await enterpriseFinancialsService.listFinancialDocuments(companyId, {
        page: pagination?.page,
        limit: pagination?.limit,
        sortOrder: pagination?.sortOrder,
        documentStatus,
        dateFrom: pagination?.dateFrom,
        dateTo: pagination?.dateTo,
      });
    if (!result) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendPaginated(
      res,
      "Financial documents",
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  } catch {
    sendServerError(res, "Failed to list financial documents");
  }
}

export async function getFinancialDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const documentId = getParam(req.params, "documentId");
  try {
    const doc =
      await enterpriseFinancialsService.getFinancialDocument(
        companyId,
        documentId,
      );
    if (!doc) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Financial document", doc);
  } catch {
    sendServerError(res, "Failed to get document");
  }
}

export async function getProcessingQueue(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  try {
    const queue =
      await enterpriseFinancialsService.getProcessingQueue(companyId);
    if (!queue) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Processing queue", queue);
  } catch {
    sendServerError(res, "Failed to get processing queue");
  }
}

export async function getInvoice(req: IRequest, res: Response): Promise<void> {
  const companyId = req.companyId!;
  const invoiceId = getParam(req.params, "invoiceId");
  try {
    const invoice = await enterpriseFinancialsService.getInvoice(
      companyId,
      invoiceId,
    );
    if (!invoice) {
      sendNotFound(res, "Invoice not found");
      return;
    }
    sendResult(res, "Invoice", invoice);
  } catch {
    sendServerError(res, "Failed to get invoice");
  }
}

export async function updateInvoice(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const invoiceId = getParam(req.params, "invoiceId");
  const data = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
    clientName?: string;
    clientAddress?: string;
    clientEmail?: string;
    dateIssued?: string;
    dueDate?: string;
    notes?: string;
    financialDocumentId?: string | null;
    lineItems?: Array<{
      description?: string;
      quantity?: number;
      unitPrice?: number;
      total?: number;
    }>;
  };
  const update: {
    clientName?: string;
    clientAddress?: string;
    clientEmail?: string;
    dateIssued?: Date;
    dueDate?: Date;
    notes?: string;
    financialDocumentId?: string | null;
    lineItems?: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
  } = {};
  if (data.clientName != null) update.clientName = data.clientName.trim();
  if (data.clientAddress != null) update.clientAddress = data.clientAddress.trim();
  if (data.clientEmail != null) update.clientEmail = data.clientEmail.trim();
  if (data.dateIssued) update.dateIssued = new Date(data.dateIssued);
  if (data.dueDate) update.dueDate = new Date(data.dueDate);
  if (data.notes != null) update.notes = data.notes.trim();
  if (Array.isArray(data.lineItems)) {
    update.lineItems = data.lineItems.map((item) => ({
      description: String(item.description ?? ""),
      quantity: Number(item.quantity ?? 0),
      unitPrice: Number(item.unitPrice ?? 0),
      total: Number(item.total ?? 0),
    }));
  }
  if (Object.prototype.hasOwnProperty.call(data, "financialDocumentId")) {
    update.financialDocumentId =
      data.financialDocumentId == null || data.financialDocumentId === ""
        ? null
        : String(data.financialDocumentId);
  }
  try {
    const invoice = await enterpriseFinancialsService.updateInvoice(
      companyId,
      invoiceId,
      update,
    );
    if (!invoice) {
      sendNotFound(res, "Invoice not found");
      return;
    }
    sendResult(res, "Invoice updated", invoice);
  } catch {
    sendServerError(res, "Failed to update invoice");
  }
}

export async function markInvoicePaid(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const invoiceId = getParam(req.params, "invoiceId");
  try {
    const invoice = await enterpriseFinancialsService.markInvoicePaid(
      companyId,
      invoiceId,
    );
    if (!invoice) {
      sendNotFound(res, "Invoice not found");
      return;
    }
    sendResult(res, "Invoice marked as paid", invoice);
  } catch {
    sendServerError(res, "Failed to mark invoice paid");
  }
}

export async function getInvoicePdf(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const invoiceId = getParam(req.params, "invoiceId");
  try {
    const invoice = await enterpriseFinancialsService.getInvoice(
      companyId,
      invoiceId,
    );
    if (!invoice) {
      sendNotFound(res, "Invoice not found");
      return;
    }
    sendResult(res, "Invoice PDF URL (stub)", {
      pdfUrl: `/api/v1/enterprise/clients/${req.clientId ?? companyId}/financials/invoices/${invoiceId}/pdf`,
      invoiceNumber: invoice.invoiceNumber,
    });
  } catch {
    sendServerError(res, "Failed to get invoice PDF");
  }
}

export async function listInvoices(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const pagination = req.pagination;
  try {
    const result = await enterpriseFinancialsService.listInvoices(companyId, {
      page: pagination?.page,
      limit: pagination?.limit,
      sortOrder: pagination?.sortOrder,
      dateFrom: pagination?.dateFrom,
      dateTo: pagination?.dateTo,
    });
    if (!result) {
      sendNotFound(res, "Company not found");
      return;
    }
    // Ensure list rows expose optional links explicitly.
    const rows = result.data.map((inv) => ({
      ...inv,
      documentId: inv.documentId ?? null,
      financialDocumentId: inv.financialDocumentId ?? null,
    }));
    sendPaginated(
      res,
      "Invoices",
      rows,
      result.total,
      result.page,
      result.limit,
    );
  } catch {
    sendServerError(res, "Failed to list invoices");
  }
}

export async function createInvoice(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const data = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
    clientName: string;
    clientAddress: string;
    clientEmail: string;
    dateIssued?: string;
    dueDate?: string;
    totalAmount?: number;
    notes?: string;
    financialDocumentId?: string;
    lineItems?: Array<{
      description?: string;
      quantity?: number;
      unitPrice?: number;
      total?: number;
    }>;
  };
  const dateIssued = data.dateIssued ? new Date(data.dateIssued) : new Date();
  const dueDate = data.dueDate ? new Date(data.dueDate) : new Date();
  const lineItems = Array.isArray(data.lineItems)
    ? data.lineItems.map((item) => ({
        description: String(item.description ?? ""),
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        total: Number(item.total ?? 0),
      }))
    : [];
  try {
    const invoice = await enterpriseFinancialsService.createInvoice(companyId, {
      clientName: data.clientName,
      clientAddress: data.clientAddress,
      clientEmail: data.clientEmail,
      dateIssued,
      dueDate,
      totalAmount: Number(data.totalAmount ?? 0),
      notes: data.notes,
      financialDocumentId: data.financialDocumentId?.trim() || undefined,
      lineItems,
    });
    if (!invoice) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendCreated(res, "Invoice created", invoice);
  } catch {
    sendServerError(res, "Failed to create invoice");
  }
}
