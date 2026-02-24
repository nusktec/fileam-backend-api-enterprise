import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";

export function sendNotFound(
  res: Response,
  message: string = "Not found",
): void {
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

export function sendServerError(
  res: Response,
  message: string = "Internal server error",
): void {
  res
    .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
    .json(outJson(false, message, null));
}
