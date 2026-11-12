import { Response } from "express";
import { IRequest } from "../../../interfaces/CustomRequest";
import { getAuthUserId } from "../../../utils/authHelpers";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { outJson } from "../../../utils/renders";
import { sendResult, sendServerError } from "../../utils/controllerHelpers";
import { featuresTaxAssumptionsService } from "../services/taxAssumptionsService";

export async function patchTaxAssumptions(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const data = await featuresTaxAssumptionsService.update(
      getAuthUserId(req),
      String(req.params.clientId),
      {
        vatRegistrationStatus: req.body?.vatRegistrationStatus,
        applicationCitRate:
          req.body?.applicationCitRate != null
            ? Number(req.body.applicationCitRate)
            : undefined,
        msmeExemptionEligible:
          req.body?.msmeExemptionEligible != null
            ? Boolean(req.body.msmeExemptionEligible)
            : undefined,
      },
    );
    sendResult(res, "Tax assumptions updated", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to update tax assumptions");
  }
}
