import { Response } from "express";
import { IRequest } from "../../../interfaces/CustomRequest";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { outJson } from "../../../utils/renders";
import { sendResult, sendServerError } from "../../utils/controllerHelpers";
import { featuresTaxOptimizerService } from "../services/taxOptimizerService";

export async function getTaxOptimizerSnapshot(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const data = await featuresTaxOptimizerService.getSnapshot(
      req.linkedUserId!,
      year,
    );
    sendResult(res, "Tax optimizer snapshot", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to get tax optimizer snapshot");
  }
}
