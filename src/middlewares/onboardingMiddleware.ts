import { Response, NextFunction } from "express";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { IRequest } from "../interfaces/CustomRequest";
import { onboardingService } from "../services/onboardingService";

export function requireOnboardingToken(
  req: IRequest,
  res: Response,
  next: NextFunction,
): void {
  const token =
    req.header("Authorization")?.replace("Bearer ", "") ??
    req.header("X-Onboarding-Token") ??
    (req.body?.onboardingToken as string | undefined);

  if (!token) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Onboarding token required.", null));
    return;
  }

  const payload = onboardingService.verifyOnboardingToken(token);
  if (!payload) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Invalid or expired onboarding token.", null));
    return;
  }

  req.onboardingPayload = payload;
  next();
}
