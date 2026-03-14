import { Response } from "express";
import { prisma } from "../../config/database";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { sendResult, sendServerError } from "../utils/controllerHelpers";
import { listManagedEntities } from "../services/enterpriseManagedEntitiesService";

export async function listManagedEntitiesHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Authentication required.", null));
    return;
  }
  const q = (req.query.q as string)?.trim();
  try {
    const entities = await listManagedEntities(userId, q);
    sendResult(res, "Managed entities (clients)", entities);
  } catch {
    sendServerError(res, "Failed to list managed entities");
  }
}
