import { Response } from "express";
import { matchedData } from "express-validator";
import { IRequest } from "../../interfaces/CustomRequest";
import { sendResult, sendServerError } from "../utils/controllerHelpers";
import { upsertTaxConfiguration } from "../services/clientTaxConfigurationService";

export async function putTaxConfiguration(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  const data = matchedData(req, {
    locations: ["body"],
    includeOptionals: true,
  }) as {
    vat?: boolean;
    paye?: boolean;
    wht?: boolean;
    cit?: boolean;
    stampDuties?: boolean;
  };
  try {
    const config = await upsertTaxConfiguration(companyId, data);
    sendResult(res, "Tax configuration updated", {
      vat: config.vat,
      paye: config.paye,
      wht: config.wht,
      cit: config.cit,
      stampDuties: config.stampDuties,
    });
  } catch {
    sendServerError(res, "Failed to update tax configuration");
  }
}
