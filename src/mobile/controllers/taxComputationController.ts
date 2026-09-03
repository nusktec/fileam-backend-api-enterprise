import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { taxComputationService } from "../services/taxComputationService";
import {
  parseTaxPeriodRange,
  resolveTaxPeriod,
  TAX_PERIOD_RANGES,
} from "../../utils/taxPeriodQuery";

export const getTaxComputation = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const range = parseTaxPeriodRange(req.query.range);
    if (
      req.query.range &&
      !TAX_PERIOD_RANGES.includes(
        String(req.query.range).trim().toLowerCase() as (typeof TAX_PERIOD_RANGES)[number],
      )
    ) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(false, "Invalid range. Use month, quarter, or year.", null),
        );
      return;
    }

    const { year, month } = resolveTaxPeriod(req.query.period);
    const data = await taxComputationService.getForQuery(userId, {
      year,
      month,
      range,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Tax computation retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve tax computation", null));
  }
};
