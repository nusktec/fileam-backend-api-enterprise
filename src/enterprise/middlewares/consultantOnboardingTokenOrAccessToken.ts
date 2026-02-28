import { Response, NextFunction } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { consultantOnboardingService } from "../services/consultantOnboardingService";
import { onboardingService } from "../../services/onboardingService";
import type { Prisma } from "@prisma/client";
import { verifyToken } from "../../utils/jwt";
import { prisma } from "../../config/database";

const defaultOptions = { allowOnboardingToken: true };

export function consultantOnboardingTokenOrAccessToken(
  options: { allowOnboardingToken?: boolean } = defaultOptions,
) {
  const allowOnboardingToken = options.allowOnboardingToken !== false;
  const noTokenMessage = allowOnboardingToken
    ? "Consultant onboarding, onboarding, or access token required."
    : "Consultant onboarding, or access token required.";

  return async function (
    req: IRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token =
      req.header("Authorization")?.replace(/^Bearer\s+/i, "") ??
      req.header("X-Consultant-Onboarding-Token") ??
      req.header("Consultant-Onboarding-Token") ??
      (allowOnboardingToken ? req.header("X-Onboarding-Token") : undefined) ??
      (allowOnboardingToken ? req.header("Onboarding-Token") : undefined) ??
      (req.body?.consultantOnboardingToken as string | undefined) ??
      (allowOnboardingToken
        ? (req.body?.onboardingToken as string | undefined)
        : undefined);

    if (!token) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json(outJson(false, noTokenMessage, null));
      return;
    }

    try {
      const payload = consultantOnboardingService.verifyToken(token);
      if (payload?.sessionId) {
        const session = await prisma.consultantOnboardingSession.findUnique({
          where: { id: payload.sessionId },
        });
        if (session) {
          req.consultantOnboardingSession = session;
          return next();
        }
      }
    } catch {}

    if (allowOnboardingToken) {
      try {
        const onboardingPayload =
          onboardingService.verifyOnboardingToken(token);
        if (onboardingPayload?.email) {
          req.onboardingPayload = onboardingPayload;
          return next();
        }
      } catch {}
    }

    try {
      const decoded = verifyToken(token);
      if (!decoded.userId || (decoded.type && decoded.type !== "access")) {
        res
          .status(HttpStatusCode.UNAUTHORIZED)
          .json(outJson(false, "Invalid or expired token.", null));
        return;
      }
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true },
      });
      if (!user?.email) {
        res
          .status(HttpStatusCode.UNAUTHORIZED)
          .json(outJson(false, "Invalid or expired token.", null));
        return;
      }
      req.onboardingPayload = {
        email: user.email,
        acceptedInvitationIds: [],
      };
      const session = await prisma.consultantOnboardingSession.findFirst({
        where: {
          userId: user.id,
        } as Prisma.ConsultantOnboardingSessionWhereInput,
        orderBy: { updatedAt: "desc" },
      });
      if (session) req.consultantOnboardingSession = session;
      return next();
    } catch {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json(outJson(false, "Invalid or expired token.", null));
    }
  };
}
