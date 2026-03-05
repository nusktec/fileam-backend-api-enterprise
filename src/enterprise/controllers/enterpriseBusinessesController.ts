import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { sendResult, sendServerError } from "../utils/controllerHelpers";
import { enterpriseBusinessesService } from "../services/enterpriseBusinessesService";

export async function listAllBusinesses(
  req: IRequest,
  res: Response,
): Promise<void> {
  const q = (req.query.q as string) ?? "";
  try {
    const businesses = await enterpriseBusinessesService.listAllBusinesses({
      q: q || undefined,
    });
    sendResult(res, "Businesses", businesses);
  } catch {
    sendServerError(res, "Failed to list businesses");
  }
}
