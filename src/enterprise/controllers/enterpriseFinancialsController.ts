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
import { enterpriseFinancialsService } from "../services/enterpriseFinancialsService";

export async function getRecentTransactions(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  try {
    const list = await enterpriseFinancialsService.getRecentTransactions(companyId, limit);
    if (!list) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Recent transactions", list);
  } catch {
    sendServerError(res, "Failed to get transactions");
  }
}

export async function getAllTransactions(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const pagination = req.pagination;
  try {
    const result = await enterpriseFinancialsService.getAllTransactions(companyId, {
      page: pagination?.page,
      limit: pagination?.limit,
      sortOrder: pagination?.sortOrder,
    });
    if (!result) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendPaginated(res, "Transactions", result.data, result.total, result.page, result.limit);
  } catch {
    sendServerError(res, "Failed to get transactions");
  }
}

export async function getSummary(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  try {
    const summary = await enterpriseFinancialsService.getSummary(companyId);
    if (!summary) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Financial summary", summary);
  } catch {
    sendServerError(res, "Failed to get summary");
  }
}

export async function getMonthlyCashFlow(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const year = req.query.year ? Number(req.query.year) : undefined;
  try {
    const data = await enterpriseFinancialsService.getMonthlyCashFlow(companyId, year);
    if (!data) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Monthly cash flow", data);
  } catch {
    sendServerError(res, "Failed to get cash flow");
  }
}

export async function addTransaction(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const body = req.body || {};
  const description = body.description != null ? String(body.description).trim() : "";
  const date = body.date ? new Date(body.date) : new Date();
  const amount = Number(body.amount ?? 0);
  const status = body.status != null ? String(body.status).trim() : "Pending";
  const type = body.type != null ? String(body.type).trim() : "expense";
  try {
    const t = await enterpriseFinancialsService.addTransaction(companyId, {
      date,
      description,
      amount,
      status,
      type,
    });
    if (!t) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendCreated(res, "Transaction added", t);
  } catch {
    sendServerError(res, "Failed to add transaction");
  }
}

export async function getDocumentTypes(_req: IRequest, res: Response): Promise<void> {
  try {
    const types = enterpriseFinancialsService.getDocumentTypes();
    sendResult(res, "Document types", types);
  } catch {
    sendServerError(res, "Failed to get document types");
  }
}

export async function getCurrencies(_req: IRequest, res: Response): Promise<void> {
  try {
    const currencies = enterpriseFinancialsService.getCurrencies();
    sendResult(res, "Currencies", currencies);
  } catch {
    sendServerError(res, "Failed to get currencies");
  }
}

export async function uploadDocument(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const body = req.body || {};
  const documentType = body.documentType != null ? String(body.documentType).trim() : "";
  const description = body.description != null ? String(body.description).trim() : undefined;
  const documentDate = body.documentDate ? new Date(body.documentDate) : new Date();
  const amount = Number(body.amount ?? 0);
  const currency = body.currency != null ? String(body.currency).trim() : "USD";
  const fileUrl = body.fileUrl ?? (req.file ? (req as unknown as { file: { path: string } }).file?.path : undefined);
  try {
    const doc = await enterpriseFinancialsService.uploadDocument(companyId, {
      documentType,
      description,
      documentDate,
      amount,
      currency,
      fileUrl,
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

export async function getDocumentStatus(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const documentId = getParam(req.params, "documentId");
  try {
    const status = await enterpriseFinancialsService.getDocumentStatus(companyId, documentId);
    if (!status) {
      sendNotFound(res, "Document not found");
      return;
    }
    sendResult(res, "Document status", status);
  } catch {
    sendServerError(res, "Failed to get document status");
  }
}

export async function getProcessingQueue(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  try {
    const queue = await enterpriseFinancialsService.getProcessingQueue(companyId);
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
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const invoiceId = getParam(req.params, "invoiceId");
  try {
    const invoice = await enterpriseFinancialsService.getInvoice(companyId, invoiceId);
    if (!invoice) {
      sendNotFound(res, "Invoice not found");
      return;
    }
    sendResult(res, "Invoice", invoice);
  } catch {
    sendServerError(res, "Failed to get invoice");
  }
}

export async function updateInvoice(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const invoiceId = getParam(req.params, "invoiceId");
  const body = req.body || {};
  const update: {
    clientName?: string;
    clientAddress?: string;
    clientEmail?: string;
    dateIssued?: Date;
    dueDate?: Date;
    notes?: string;
    lineItems?: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  } = {};
  if (body.clientName != null) update.clientName = String(body.clientName).trim();
  if (body.clientAddress != null) update.clientAddress = String(body.clientAddress).trim();
  if (body.clientEmail != null) update.clientEmail = String(body.clientEmail).trim();
  if (body.dateIssued) update.dateIssued = new Date(body.dateIssued);
  if (body.dueDate) update.dueDate = new Date(body.dueDate);
  if (body.notes != null) update.notes = String(body.notes).trim();
  if (Array.isArray(body.lineItems)) {
    update.lineItems = body.lineItems.map((item: { description?: string; quantity?: number; unitPrice?: number; total?: number }) => ({
      description: String(item.description ?? ""),
      quantity: Number(item.quantity ?? 0),
      unitPrice: Number(item.unitPrice ?? 0),
      total: Number(item.total ?? 0),
    }));
  }
  try {
    const invoice = await enterpriseFinancialsService.updateInvoice(companyId, invoiceId, update);
    if (!invoice) {
      sendNotFound(res, "Invoice not found");
      return;
    }
    sendResult(res, "Invoice updated", invoice);
  } catch {
    sendServerError(res, "Failed to update invoice");
  }
}

export async function markInvoicePaid(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const invoiceId = getParam(req.params, "invoiceId");
  try {
    const invoice = await enterpriseFinancialsService.markInvoicePaid(companyId, invoiceId);
    if (!invoice) {
      sendNotFound(res, "Invoice not found");
      return;
    }
    sendResult(res, "Invoice marked as paid", invoice);
  } catch {
    sendServerError(res, "Failed to mark invoice paid");
  }
}

export async function getInvoicePdf(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const invoiceId = getParam(req.params, "invoiceId");
  try {
    const invoice = await enterpriseFinancialsService.getInvoice(companyId, invoiceId);
    if (!invoice) {
      sendNotFound(res, "Invoice not found");
      return;
    }
    sendResult(res, "Invoice PDF URL (stub)", {
      pdfUrl: `/api/v1/enterprise/company/${companyId}/financials/invoices/${invoiceId}/pdf`,
      invoiceNumber: invoice.invoiceNumber,
    });
  } catch {
    sendServerError(res, "Failed to get invoice PDF");
  }
}

export async function listInvoices(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const pagination = req.pagination;
  try {
    const result = await enterpriseFinancialsService.listInvoices(companyId, {
      page: pagination?.page,
      limit: pagination?.limit,
      sortOrder: pagination?.sortOrder,
    });
    if (!result) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendPaginated(res, "Invoices", result.data, result.total, result.page, result.limit);
  } catch {
    sendServerError(res, "Failed to list invoices");
  }
}

export async function createInvoice(req: IRequest, res: Response): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const body = req.body || {};
  const invoiceNumber = body.invoiceNumber != null ? String(body.invoiceNumber).trim() : "";
  const clientName = body.clientName != null ? String(body.clientName).trim() : "";
  const clientAddress = body.clientAddress != null ? String(body.clientAddress).trim() : "";
  const clientEmail = body.clientEmail != null ? String(body.clientEmail).trim() : "";
  const dateIssued = body.dateIssued ? new Date(body.dateIssued) : new Date();
  const dueDate = body.dueDate ? new Date(body.dueDate) : new Date();
  const totalAmount = Number(body.totalAmount ?? 0);
  const notes = body.notes != null ? String(body.notes).trim() : undefined;
  const lineItems = Array.isArray(body.lineItems)
    ? body.lineItems.map((item: { description?: string; quantity?: number; unitPrice?: number; total?: number }) => ({
        description: String(item.description ?? ""),
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        total: Number(item.total ?? 0),
      }))
    : [];
  try {
    const invoice = await enterpriseFinancialsService.createInvoice(companyId, {
      invoiceNumber,
      clientName,
      clientAddress,
      clientEmail,
      dateIssued,
      dueDate,
      totalAmount,
      notes,
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
