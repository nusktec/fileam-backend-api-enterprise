import { Response, NextFunction } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { prisma } from "../../config/database";

export async function requireEnterpriseOnboardingComplete(
  req: IRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user;
  if (!user) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Authentication required.", null));
    return;
  }
  const enterpriseComplete = (user as { enterpriseOnboardingComplete?: boolean })
    .enterpriseOnboardingComplete;
  if (enterpriseComplete) {
    next();
    return;
  }
  const [hasActivatedSession, hasCompany] = await Promise.all([
    prisma.consultantOnboardingSession.findFirst({
      where: { userId: user.id, status: "activated" },
      select: { id: true },
    }),
    prisma.company.findFirst({
      where: { ownerId: user.id },
      select: { id: true },
    }),
  ]);
  if (hasActivatedSession || hasCompany) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        enterpriseOnboardingComplete: true,
        enterpriseOnboardingStep: "complete",
      } as { enterpriseOnboardingComplete: boolean; enterpriseOnboardingStep: string },
    });
    next();
    return;
  }
  const step = (user as { enterpriseOnboardingStep?: string | null })
    .enterpriseOnboardingStep;
  res.status(HttpStatusCode.FORBIDDEN).json(
    outJson(false, "Complete enterprise onboarding to access this resource.", {
      enterpriseOnboardingStep: step ?? "company_creation",
    }),
  );
}
