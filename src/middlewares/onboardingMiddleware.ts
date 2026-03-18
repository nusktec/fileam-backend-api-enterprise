import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
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
  let token: string | undefined =
    req.header("Authorization")?.replace(/^Bearer\s+/i, "") ??
    req.header("X-Onboarding-Token") ??
    (req.body?.onboardingToken as string | undefined);

  if (token) {
    token = token.trim();
    if (token.toLowerCase().startsWith("bearer ")) {
      token = token.slice(7).trim();
    }
  }

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
  let token: string | undefined =
    req.header("Authorization")?.replace(/^Bearer\s+/i, "") ??
    req.header("X-Onboarding-Token") ??
    (req.body?.onboardingToken as string | undefined);

  if (token) {
    token = token.trim();
    if (token.toLowerCase().startsWith("bearer ")) {
      token = token.slice(7).trim();
    }
  }

  if (!token) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Onboarding or access token required.", null));
    return;
  }

  const onboardingPayload = onboardingService.verifyOnboardingToken(token);
  if (onboardingPayload?.email) {
    req.onboardingPayload = onboardingPayload;
    return next();
  }

  const decodedUnverified = jwt.decode(token) as { exp?: number; email?: string } | null;
  if (decodedUnverified && typeof decodedUnverified.exp === "number") {
    const isExpired = decodedUnverified.exp * 1000 < Date.now();
    if (isExpired) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(
        outJson(
          false,
          "Onboarding token expired. Complete step/email and step/email-verify again to get a new token.",
          null,
        ),
      );
      return;
    }
    if (decodedUnverified.email) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(
        outJson(
          false,
          "Invalid onboarding token (signature mismatch). Ensure JWT_SECRET is consistent and complete step/email-verify again if needed.",
          null,
        ),
      );
      return;
    }
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
      res.status(HttpStatusCode.UNAUTHORIZED).json(
        outJson(
          false,
          "User not found. The token may be from a different environment. For step/password, use the onboarding token from step/email-verify on this server.",
          null,
        ),
      );
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
