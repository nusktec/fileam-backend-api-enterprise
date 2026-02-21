import { Response, NextFunction } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { consultantOnboardingService } from "../services/consultantOnboardingService";
import { prisma } from "../../config/database";

export async function requireConsultantOnboardingToken(
  req: IRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token =
    req.header("Authorization")?.replace("Bearer ", "") ??
    req.header("X-Consultant-Onboarding-Token") ??
    (req.body?.consultantOnboardingToken as string | undefined);

  if (!token) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Consultant onboarding token required.", null));
    return;
  }

  const payload = consultantOnboardingService.verifyToken(token);
  if (!payload) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(
        outJson(false, "Invalid or expired consultant onboarding token.", null),
      );
    return;
  }

  const session = await prisma.consultantOnboardingSession.findUnique({
    where: { id: payload.sessionId },
  });
  if (!session) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Consultant onboarding session not found.", null));
    return;
  }

  req.consultantOnboardingSession = session;
  next();
}
