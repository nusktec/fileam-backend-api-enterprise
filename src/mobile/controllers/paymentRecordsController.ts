import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { paymentRecordsService } from "../services/paymentRecordsService";

export const listPayments = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const taxPayableId = req.query.taxPayableId as string | undefined;
    const status = req.query.status as string | undefined;
    const data = await paymentRecordsService.list(userId, { taxPayableId, status });
    res.status(HttpStatusCode.OK).json(outJson(true, "Payment history retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve payment history", null));
  }
};

export const getPaymentById = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const recordId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!recordId) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Payment record ID required", null));
      return;
    }
    const data = await paymentRecordsService.getById(userId, recordId);
    if (!data) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Payment record not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Payment record retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve payment record", null));
  }
};
