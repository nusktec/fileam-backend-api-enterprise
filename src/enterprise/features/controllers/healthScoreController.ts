import { Response } from "express";
import { IRequest } from "../../../interfaces/CustomRequest";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { outJson } from "../../../utils/renders";
import { sendResult, sendServerError } from "../../utils/controllerHelpers";
import { featuresHealthScoreService } from "../services/healthScoreService";

export async function getHealthScore(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const data = await featuresHealthScoreService.getScore(
      req.linkedUserId!,
      year,
    );
    sendResult(res, "Business health score", data);
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res.status(error.statusCode).json(outJson(false, error.message, null));
      return;
    }
    sendServerError(res, "Failed to compute health score");
  }
}
