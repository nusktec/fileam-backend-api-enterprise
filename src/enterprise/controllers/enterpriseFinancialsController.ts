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
      },
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
  };
  const date = data.date ? new Date(data.date) : new Date();
  try {
    const t = await enterpriseFinancialsService.addTransaction(companyId, {
      date,
      description: data.description,
      amount: Number(data.amount ?? 0),
      status: (data.status ?? "Pending").trim(),
      type: (data.type ?? "expense").trim(),
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
      pdfUrl: `/api/v1/enterprise/company/${companyId}/financials/invoices/${invoiceId}/pdf`,
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
    });
    if (!result) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendPaginated(
      res,
      "Invoices",
      result.data,
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
