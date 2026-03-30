import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { IRequest } from "../interfaces/CustomRequest";
import { accountDeletionService } from "../services/accountDeletionService";

const GENERIC_SUCCESS_MESSAGE =
  "If an account is registered with this email, your deletion request has been received.";

export async function getPublicAccountDeletionReasonCategories(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const categories = accountDeletionService.getReasonCategories();
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Account deletion reason categories", { categories }));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load categories", null));
  }
}

export async function requestPublicAccountDeletionByEmail(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const { email } = matchedData(req, { locations: ["body"] }) as {
      email: string;
    };
    await accountDeletionService.requestAccountDeletionByEmail(email);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, GENERIC_SUCCESS_MESSAGE, null));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Could not process your request. Please try again later.", null));
  }
}
