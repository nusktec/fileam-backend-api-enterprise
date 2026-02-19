import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { salesService } from "../services/salesService";

export const listSales = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const status = (req.query.status as string) || "all";
    const data = await salesService.list(userId, status);
    res.status(HttpStatusCode.OK).json(outJson(true, "Sales retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve sales", null));
  }
};

export const getSaleById = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const saleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!saleId) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Sale ID required", null));
      return;
    }
    const sale = await salesService.getById(userId, saleId);
    if (!sale) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Sale not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Sale details retrieved", sale));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve sale", null));
  }
};

export const createSale = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const { amount, description, customerName, paymentType, date, vatableIncome, serviceIncome } =
      req.body;
    const sale = await salesService.create(userId, {
      amount: Number(amount),
      description,
      customerName,
      paymentType,
      date,
      vatableIncome: Boolean(vatableIncome),
      serviceIncome: serviceIncome !== false,
    });
    res.status(HttpStatusCode.CREATED).json(outJson(true, "Sale added", sale));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add sale", null));
  }
};
