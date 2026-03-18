import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { salesService } from "../services/salesService";

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
    const {
      amount,
      description,
      category,
      customerName,
      paymentType,
      date,
      vatableIncome,
      serviceIncome,
    } = req.body;
    const sale = await salesService.create(userId, {
      amount: Number(amount),
      description,
      category,
      customerName,
      paymentType,
      date,
      vatableIncome: Boolean(vatableIncome),
      serviceIncome: serviceIncome !== false,
    });
    if (!sale) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User not found", null));
      return;
    }
    res.status(HttpStatusCode.CREATED).json(outJson(true, "Sale added", sale));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add sale", null));
  }
};
