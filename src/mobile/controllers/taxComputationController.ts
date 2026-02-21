import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { taxComputationService } from "../services/taxComputationService";

export const getTaxComputation = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const period = (req.query.period as string) || "";
    const match = period.match(/^(\d{4})-(\d{2})$/);
    const now = new Date();
    const year = match ? parseInt(match[1], 10) : now.getFullYear();
    const month = match ? parseInt(match[2], 10) : now.getMonth() + 1;
    if (month < 1 || month > 12) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(false, "Invalid period. Use YYYY-MM (e.g. 2026-02)", null),
        );
      return;
    }
    const data = await taxComputationService.getForPeriod(userId, year, month);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Tax computation retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve tax computation", null));
  }
};
