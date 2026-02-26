import { Response, NextFunction } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { consultantOnboardingService } from "../services/consultantOnboardingService";
import type { Prisma } from "@prisma/client";
import { verifyToken } from "../../utils/jwt";
import { prisma } from "../../config/database";

export async function requireConsultantOnboardingToken(
  req: IRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token =
    req.header("Authorization")?.replace(/^Bearer\s+/i, "") ??
    req.header("X-Consultant-Onboarding-Token") ??
    (req.body?.consultantOnboardingToken as string | undefined);

  if (!token) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(
        outJson(false, "Consultant onboarding or access token required.", null),
      );
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
  } catch {
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded.userId || (decoded.type && decoded.type !== "access")) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json(
          outJson(
            false,
            "Invalid or expired consultant onboarding token.",
            null,
          ),
        );
      return;
    }
    const session = await prisma.consultantOnboardingSession.findFirst({
      where: {
        userId: decoded.userId,
      } as Prisma.ConsultantOnboardingSessionWhereInput,
      orderBy: { updatedAt: "desc" },
    });
    if (!session) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json(
          outJson(
            false,
            "No consultant onboarding session found for this account.",
            null,
          ),
        );
      return;
    }
    req.consultantOnboardingSession = session;
    return next();
  } catch {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(
        outJson(
          false,
          "Invalid or expired consultant onboarding token.",
          null,
        ),
      );
  }
}
