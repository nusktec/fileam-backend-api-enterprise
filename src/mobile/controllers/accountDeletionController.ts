import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { accountDeletionService } from "../../services/accountDeletionService";

export async function getAccountDeletionReasonCategories(
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

export async function requestAccountDeletion(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const result = await accountDeletionService.requestAccountDeletion(userId);
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "User not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(true, "Account deletion request recorded", {
          requestDelete: true,
        }),
      );
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to record deletion request", null));
  }
}
