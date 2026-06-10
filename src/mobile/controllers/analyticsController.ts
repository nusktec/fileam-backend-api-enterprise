import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { analyticsService } from "../services/analyticsService";
import { financialOverviewService } from "../services/financialOverviewService";

export const getFinancialOverview = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const rawYear = req.query.year;
    const now = new Date();
    const year =
      rawYear != null && String(rawYear).trim() !== ""
        ? parseInt(String(rawYear), 10)
        : now.getFullYear();
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Invalid year. Use a value like 2026.", null));
      return;
    }
    const data = await financialOverviewService.getOverview(userId, year);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Financial overview retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve financial overview", null));
  }
};

export const getDashboard = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const period = (req.query.period as string) || "";
    const range = ((req.query.range as string) || "month") as
      | "month"
      | "quarter"
      | "year";
    if (!["month", "quarter", "year"].includes(range)) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(false, "Invalid range. Use month, quarter, or year.", null),
        );
      return;
    }
    const now = new Date();
    const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const data = await analyticsService.getDashboard(
      userId,
      period || defaultPeriod,
      range,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Analytics dashboard retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve analytics dashboard", null));
  }
};
