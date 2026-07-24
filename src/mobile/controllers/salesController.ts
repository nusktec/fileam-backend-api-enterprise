import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { salesService } from "../services/salesService";
import { HttpReplyError } from "../../utils/httpReplyError";
import { monetaryAmountLimitMessage } from "../../utils/monetaryAmount";

function replySaleError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return true;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2000"
  ) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, monetaryAmountLimitMessage("Amount"), null));
    return true;
  }
  return false;
}

export const listSales = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const status = (req.query.status as string) || "all";
    const pagination = req.pagination;
    const data = await salesService.list(userId, status, {
      page: pagination?.page,
      limit: pagination?.limit,
      sortOrder: pagination?.sortOrder,
      dateFrom: pagination?.dateFrom,
      dateTo: pagination?.dateTo,
    });
    res.status(HttpStatusCode.OK).json(outJson(true, "Sales retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve sales", null));
  }
};

export const getSaleById = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const saleId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const sale = await salesService.getById(userId, saleId!);
    if (!sale) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Sale not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Sale details retrieved", sale));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve sale", null));
  }
};

export const getSaleDetails = getSaleById;

export const downloadSaleInvoice = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const saleId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const { generatePdfForDocument } = await import(
      "../services/evidenceVaultPdfService"
    );
    const result = await generatePdfForDocument(userId, `sale-${saleId!}`);
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Sale not found or invoice unavailable", null));
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader("Content-Length", result.buffer.length);
    res.status(HttpStatusCode.OK).send(result.buffer);
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to download invoice", null));
  }
};

export const createSale = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const sale = await salesService.create(
      userId,
      mapSaleCreateBody(req.body ?? {}),
    );
    if (!sale) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User not found", null));
      return;
    }
    res.status(HttpStatusCode.CREATED).json(outJson(true, "Sale added", sale));
  } catch (error) {
    if (replySaleError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add sale", null));
  }
};

function mapSaleCreateBody(b: Record<string, unknown>) {
  const customerName = b.customerName ?? b.Customer_name;
  const customerId = b.customerId ?? b.Customer_id;
  const itemName = b.itemName;
  const receiptUrl = b.receiptUrl;
  return {
    amount: Number(b.amount),
    description: String(b.description),
    category:
      b.category != null && String(b.category).trim() !== ""
        ? String(b.category).trim()
        : undefined,
    customerName:
      customerName != null && String(customerName).trim() !== ""
        ? String(customerName).trim()
        : undefined,
    customerId:
      customerId != null && String(customerId).trim() !== ""
        ? String(customerId).trim()
        : undefined,
    itemName:
      itemName != null && String(itemName).trim() !== ""
        ? String(itemName).trim()
        : undefined,
    receiptUrl:
      receiptUrl != null && String(receiptUrl).trim() !== ""
        ? String(receiptUrl).trim()
        : undefined,
    paymentType: String(b.paymentType),
    date: String(b.date),
    vatableIncome: Boolean(b.vatableIncome),
    serviceIncome: b.serviceIncome !== false,
  };
}

export const createSalesBulk = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
    const result = await salesService.bulkCreate(
      userId,
      itemsRaw.map((item: Record<string, unknown>) => mapSaleCreateBody(item)),
    );
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User not found", null));
      return;
    }
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Sales added", result));
  } catch (error) {
    if (replySaleError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add sales", null));
  }
};

export const updateSale = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const saleId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Record<string, unknown>;
    const keys = Object.keys(body).filter(
      (k) => body[k] !== undefined && k !== "",
    );
    if (keys.length === 0) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Provide at least one field to update", null));
      return;
    }
    const b = req.body ?? {};
    const customerName = b.customerName ?? b.Customer_name;
    const customerId = b.customerId ?? b.Customer_id;
    const itemName = b.itemName;
    const receiptUrl = b.receiptUrl;
    const updated = await salesService.update(userId, saleId!, {
      description: body.description as string | undefined,
      itemName:
        itemName !== undefined
          ? itemName === null || String(itemName).trim() === ""
            ? null
            : String(itemName).trim()
          : undefined,
      receiptUrl:
        receiptUrl !== undefined
          ? receiptUrl === null || String(receiptUrl).trim() === ""
            ? null
            : String(receiptUrl).trim()
          : undefined,
      category: body.category as string | undefined,
      customerName:
        customerName !== undefined
          ? customerName === null || String(customerName).trim() === ""
            ? null
            : String(customerName).trim()
          : undefined,
      customerId:
        customerId !== undefined
          ? customerId === null || String(customerId).trim() === ""
            ? null
            : String(customerId).trim()
          : undefined,
      amount: body.amount != null ? Number(body.amount) : undefined,
      paymentType: body.paymentType as string | undefined,
      date: body.date as string | undefined,
      vatableIncome:
        body.vatableIncome !== undefined
          ? Boolean(body.vatableIncome)
          : undefined,
      serviceIncome:
        body.serviceIncome !== undefined
          ? Boolean(body.serviceIncome)
          : undefined,
      status: body.status as string | undefined,
    });
    if (!updated) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Sale not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Sale updated", updated));
  } catch (error) {
    if (replySaleError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update sale", null));
  }
};

export const markInvoicePaid = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const saleId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const updated = await salesService.markInvoicePaid(userId, saleId!);
    if (!updated) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Sale not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Sale marked paid", updated));
  } catch (error) {
    if (replySaleError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to mark sale paid", null));
  }
};

export const updateSalePaymentStatus = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const saleId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as { status: string };
    const updated = await salesService.confirmPaymentStatus(
      userId,
      saleId!,
      body.status,
    );
    if (!updated) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Sale not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Sale payment status updated", updated));
  } catch (error) {
    if (replySaleError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update sale payment status", null));
  }
};

export const deleteSale = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const saleId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const ok = await salesService.deleteForUser(userId, saleId!);
    if (!ok) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Sale not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Sale deleted", null));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to delete sale", null));
  }
};
