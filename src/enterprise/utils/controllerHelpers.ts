import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { companyIdParam } from "./paramHelpers";

export function requireCompanyId(req: IRequest, res: Response): string | null {
  const companyId = companyIdParam(req.params);
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return null;
  }
  return companyId;
}

export function sendNotFound(res: Response, message: string = "Not found"): void {
  res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, message, null));
}

export function sendBadRequest(res: Response, message: string): void {
  res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, message, null));
}

export function sendResult<T>(res: Response, message: string, data: T): void {
  res.status(HttpStatusCode.OK).json(outJson(true, message, data));
}

export function sendCreated<T>(res: Response, message: string, data: T): void {
  res.status(HttpStatusCode.CREATED).json(outJson(true, message, data));
}

export function sendServerError(res: Response, message: string = "Internal server error"): void {
  res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, message, null));
}
