import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { financialPositionService } from "../services/financialPositionService";

export const getFinancialPosition = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await financialPositionService.get(userId);
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(true, "Financial position retrieved successfully.", data),
      );
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve financial position", null));
  }
};
