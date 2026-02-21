import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { enterpriseFinancialsService } from "../services/enterpriseFinancialsService";

export async function getRecentTransactions(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const list = await enterpriseFinancialsService.getRecentTransactions(companyId, limit);
    if (!list) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Recent transactions", list));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get transactions", null));
  }
}

export async function getAllTransactions(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const list = await enterpriseFinancialsService.getAllTransactions(companyId);
    if (!list) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "All transactions", list));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get transactions", null));
  }
}

export async function getSummary(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const summary = await enterpriseFinancialsService.getSummary(companyId);
    if (!summary) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Financial summary", summary));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get summary", null));
  }
}

export async function getMonthlyCashFlow(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const year = req.query.year ? Number(req.query.year) : undefined;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const data = await enterpriseFinancialsService.getMonthlyCashFlow(companyId, year);
    if (!data) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Monthly cash flow", data));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get cash flow", null));
  }
}

export async function addTransaction(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const body = req.body || {};
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  const date = body.date ? new Date(body.date) : new Date();
  const description = body.description != null ? String(body.description).trim() : "";
  const amount = Number(body.amount ?? 0);
  const status = body.status != null ? String(body.status).trim() : "Pending";
  const type = body.type != null ? String(body.type).trim() : "expense";
  if (!description) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "description required", null));
    return;
  }
  try {
    const t = await enterpriseFinancialsService.addTransaction(companyId, {
      date,
      description,
      amount,
      status,
      type,
    });
    if (!t) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.CREATED).json(outJson(true, "Transaction added", t));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to add transaction", null));
  }
}

export async function getDocumentTypes(_req: IRequest, res: Response): Promise<void> {
  try {
    const types = enterpriseFinancialsService.getDocumentTypes();
    res.status(HttpStatusCode.OK).json(outJson(true, "Document types", types));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get document types", null));
  }
}

export async function getCurrencies(_req: IRequest, res: Response): Promise<void> {
  try {
    const currencies = enterpriseFinancialsService.getCurrencies();
    res.status(HttpStatusCode.OK).json(outJson(true, "Currencies", currencies));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get currencies", null));
  }
}

export async function uploadDocument(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const body = req.body || {};
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  const documentType = body.documentType != null ? String(body.documentType).trim() : "";
  const description = body.description != null ? String(body.description).trim() : undefined;
  const documentDate = body.documentDate ? new Date(body.documentDate) : new Date();
  const amount = Number(body.amount ?? 0);
  const currency = body.currency != null ? String(body.currency).trim() : "USD";
  const fileUrl = body.fileUrl ?? (req.file ? (req as unknown as { file: { path: string } }).file?.path : undefined);
  if (!documentType) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "documentType required", null));
    return;
  }
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
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.CREATED).json(outJson(true, "Document uploaded", doc));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to upload document", null));
  }
}

export async function getDocumentStatus(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const documentId = req.params.documentId;
  if (!companyId || !documentId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and documentId required", null));
    return;
  }
  try {
    const status = await enterpriseFinancialsService.getDocumentStatus(companyId, documentId);
    if (!status) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Document status", status));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get document status", null));
  }
}

export async function getProcessingQueue(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const queue = await enterpriseFinancialsService.getProcessingQueue(companyId);
    if (!queue) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Processing queue", queue));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get processing queue", null));
  }
}

export async function getInvoice(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const invoiceId = req.params.invoiceId;
  if (!companyId || !invoiceId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and invoiceId required", null));
    return;
  }
  try {
    const invoice = await enterpriseFinancialsService.getInvoice(companyId, invoiceId);
    if (!invoice) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Invoice not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Invoice", invoice));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get invoice", null));
  }
}

export async function updateInvoice(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const invoiceId = req.params.invoiceId;
  const body = req.body || {};
  if (!companyId || !invoiceId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and invoiceId required", null));
    return;
  }
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
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Invoice not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Invoice updated", invoice));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to update invoice", null));
  }
}

export async function markInvoicePaid(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const invoiceId = req.params.invoiceId;
  if (!companyId || !invoiceId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and invoiceId required", null));
    return;
  }
  try {
    const invoice = await enterpriseFinancialsService.markInvoicePaid(companyId, invoiceId);
    if (!invoice) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Invoice not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Invoice marked as paid", invoice));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to mark invoice paid", null));
  }
}

export async function getInvoicePdf(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const invoiceId = req.params.invoiceId;
  if (!companyId || !invoiceId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and invoiceId required", null));
    return;
  }
  try {
    const invoice = await enterpriseFinancialsService.getInvoice(companyId, invoiceId);
    if (!invoice) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Invoice not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Invoice PDF URL (stub)", {
      pdfUrl: `/api/v1/enterprise/company/${companyId}/financials/invoices/${invoiceId}/pdf`,
      invoiceNumber: invoice.invoiceNumber,
    }));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get invoice PDF", null));
  }
}

export async function listInvoices(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const list = await enterpriseFinancialsService.listInvoices(companyId);
    if (!list) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Invoices", list));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to list invoices", null));
  }
}

export async function createInvoice(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const body = req.body || {};
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
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
  if (!invoiceNumber || !clientName || !clientAddress || !clientEmail) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "invoiceNumber, clientName, clientAddress, clientEmail required", null));
    return;
  }
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
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.CREATED).json(outJson(true, "Invoice created", invoice));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to create invoice", null));
  }
}
