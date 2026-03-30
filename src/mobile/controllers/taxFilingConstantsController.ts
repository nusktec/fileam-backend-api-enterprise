import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getTaxFilingConstants } from "../../services/taxFilingConstantsService";

export async function getMobileTaxFilingConstants(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const data = await getTaxFilingConstants();
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Tax filing constants", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load tax filing constants", null));
  }
}
