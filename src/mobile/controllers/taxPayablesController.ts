import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { taxPayablesService } from "../services/taxPayablesService";

export const listPayables = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const status = req.query.status as string | undefined;
    const taxType = req.query.taxType as string | undefined;
    const data = await taxPayablesService.list(userId, { status, taxType });
    res.status(HttpStatusCode.OK).json(outJson(true, "Tax payables retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve tax payables", null));
  }
};

export const getPayableById = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const payableId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!payableId) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Payable ID required", null));
      return;
    }
    const data = await taxPayablesService.getById(userId, payableId);
    if (!data) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Tax payable not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Tax payable retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve tax payable", null));
  }
};

export const initiatePayment = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const payableId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!payableId) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Payable ID required", null));
      return;
    }
    const payable = await taxPayablesService.getById(userId, payableId);
    if (!payable) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Tax payable not found", null));
      return;
    }
    if (payable.status === "paid" || payable.status === "overpaid") {
      res.status(HttpStatusCode.BAD_REQUEST).json(
        outJson(false, "This tax payable is already fully paid", null)
      );
      return;
    }
    const method = (req.body?.method as string) || "card";
    const reference = `PAY-${payableId.slice(0, 8)}-${Date.now()}`;
    res.status(HttpStatusCode.OK).json(
      outJson(true, "Integrate with your payment provider using the payload below", {
        payableId,
        taxType: payable.taxType,
        periodLabel: payable.periodLabel,
        amount: payable.totalPayable - payable.totalPaid,
        currency: payable.currency,
        method,
        reference,
        paymentUrl: null,
        message: "Configure your third-party payment provider and return paymentUrl here. After payment, call the payment webhook to record the result.",
      })
    );
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to initiate payment", null));
  }
};
