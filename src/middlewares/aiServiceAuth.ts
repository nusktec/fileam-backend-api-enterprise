import { NextFunction, Response } from "express";
import { IRequest } from "../interfaces/CustomRequest";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { AI_HEADERS, AI_SERVICE_SECRET } from "../constants/aiService";

export function aiServiceAuth(
  req: IRequest,
  res: Response,
  next: NextFunction,
): void {
  const clientId = req.headers[AI_HEADERS.CLIENT_ID] as string | undefined;
  const apiSecret = req.headers[AI_HEADERS.API_SECRET] as string | undefined;

  if (!clientId || !apiSecret) {
    res.status(HttpStatusCode.UNAUTHORIZED).json(
      outJson(false, "Missing X-Client-Id or X-Api-Secret header", null),
    );
    return;
  }

  if (apiSecret !== AI_SERVICE_SECRET) {
    res.status(HttpStatusCode.UNAUTHORIZED).json(
      outJson(false, "Invalid API secret", null),
    );
    return;
  }

  req.aiClientId = clientId;
  next();
}
