import { Response, NextFunction } from "express";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { IRequest } from "../interfaces/CustomRequest";
import { onboardingService } from "../services/onboardingService";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../config/database";

export function requireOnboardingToken(
  req: IRequest,
  res: Response,
  next: NextFunction,
): void {
  const token =
    req.header("Authorization")?.replace(/^Bearer\s+/i, "") ??
    req.header("X-Onboarding-Token") ??
    (req.body?.onboardingToken as string | undefined);

  if (!token) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Onboarding token required.", null));
    return;
  }

  try {
    const payload = onboardingService.verifyOnboardingToken(token);
    if (!payload || !payload.email) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json(outJson(false, "Invalid or expired onboarding token.", null));
      return;
    }
    req.onboardingPayload = payload;
    next();
  } catch {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Invalid or expired onboarding token.", null));
  }
}

export async function requireOnboardingOrAccessToken(
  req: IRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token =
    req.header("Authorization")?.replace(/^Bearer\s+/i, "") ??
    req.header("X-Onboarding-Token") ??
    (req.body?.onboardingToken as string | undefined);

  if (!token) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Onboarding or access token required.", null));
    return;
  }

  try {
    const payload = onboardingService.verifyOnboardingToken(token);
    if (payload?.email) {
      req.onboardingPayload = payload;
      return next();
    }
  } catch {
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded.userId || (decoded.type && decoded.type !== "access")) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json(outJson(false, "Invalid or expired onboarding token.", null));
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true },
    });
    if (!user?.email) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json(outJson(false, "Invalid or expired onboarding token.", null));
      return;
    }
    req.onboardingPayload = {
      email: user.email,
      acceptedInvitationIds: [],
    };
    return next();
  } catch {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Invalid or expired onboarding token.", null));
  }
}
