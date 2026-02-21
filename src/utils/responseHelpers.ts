import { Response } from "express";
import { outJson } from "./renders";
import { HttpStatusCode } from "../interfaces/system";

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function sendResult<T>(res: Response, message: string, data: T): void {
  res.status(HttpStatusCode.OK).json(outJson(true, message, data));
}

export function sendPaginated<T>(
  res: Response,
  message: string,
  data: T[],
  total: number,
  page: number,
  limit: number
): void {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  res.status(HttpStatusCode.OK).json(
    outJson(true, message, {
      data,
      total,
      page,
      limit,
      totalPages,
    })
  );
}

export function sendCreated<T>(res: Response, message: string, data: T): void {
  res.status(HttpStatusCode.CREATED).json(outJson(true, message, data));
}

export function sendNotFound(res: Response, message: string = "Not found"): void {
  res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, message, null));
}

export function sendServerError(
  res: Response,
  message: string = "Internal server error"
): void {
  res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, message, null));
}
