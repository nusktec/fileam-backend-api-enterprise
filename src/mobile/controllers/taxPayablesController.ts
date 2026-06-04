import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { taxPayablesService } from "../services/taxPayablesService";
import { parsePeriodQuery } from "../../utils/dateRangeQuery";

export const listPayables = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const status = req.query.status as string | undefined;
    const taxType = req.query.taxType as string | undefined;
    const pagination = req.pagination;
    const period = parsePeriodQuery(req.query.period);
    if (req.query.period && !period) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(false, "Invalid period. Use YYYY-MM (e.g. 2026-02)", null),
        );
      return;
    }
    const data = await taxPayablesService.list(
      userId,
      { status, taxType },
      {
        page: pagination?.page,
        limit: pagination?.limit,
        sortOrder: pagination?.sortOrder,
        dateFrom: period ? undefined : pagination?.dateFrom,
        dateTo: period ? undefined : pagination?.dateTo,
        periodYear: period?.year,
        periodMonth: period?.month,
      },
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Tax payables retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve tax payables", null));
  }
};

export const getPayableById = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const payableId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const data = await taxPayablesService.getById(userId, payableId!);
    if (!data) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Tax payable not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Tax payable retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve tax payable", null));
  }
};

export const initiatePayment = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const payableId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const payable = await taxPayablesService.getById(userId, payableId!);
    if (!payable) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Tax payable not found", null));
      return;
    }
    if (payable.status === "paid" || payable.status === "overpaid") {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "This tax payable is already fully paid", null));
      return;
    }
    const method = (req.body?.method as string) || "card";
    const reference = `PAY-${payableId.slice(0, 8)}-${Date.now()}`;
    res.status(HttpStatusCode.OK).json(
      outJson(
        true,
        "Integrate with your payment provider using the payload below",
        {
          payableId,
          taxType: payable.taxType,
          periodLabel: payable.periodLabel,
          amount: payable.totalPayable - payable.totalPaid,
          currency: payable.currency,
          method,
          reference,
          paymentLink: payable.paymentLink,
          message:
            "Use paymentLink for frontend redirect. After payment, call the payment webhook to record the result.",
        },
      ),
    );
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to initiate payment", null));
  }
};
