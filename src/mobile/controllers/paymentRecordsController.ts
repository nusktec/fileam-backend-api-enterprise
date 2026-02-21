import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { paymentRecordsService } from "../services/paymentRecordsService";

export const listPayments = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const taxPayableId = req.query.taxPayableId as string | undefined;
    const status = req.query.status as string | undefined;
    const pagination = req.pagination;
    const data = await paymentRecordsService.list(
      userId,
      { taxPayableId, status },
      {
        page: pagination?.page,
        limit: pagination?.limit,
        sortOrder: pagination?.sortOrder,
      },
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Payment history retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve payment history", null));
  }
};

export const getPaymentById = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const recordId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const data = await paymentRecordsService.getById(userId, recordId!);
    if (!data) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Payment record not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Payment record retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve payment record", null));
  }
};
