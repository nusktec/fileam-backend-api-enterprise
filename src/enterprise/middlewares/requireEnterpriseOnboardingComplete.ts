import { Response, NextFunction } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";

export function requireEnterpriseOnboardingComplete(
  req: IRequest,
  res: Response,
  next: NextFunction,
): void {
  const user = req.user;
  if (!user) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Authentication required.", null));
    return;
  }
  const enterpriseComplete = (user as { enterpriseOnboardingComplete?: boolean })
    .enterpriseOnboardingComplete;
  if (!enterpriseComplete) {
    const step = (user as { enterpriseOnboardingStep?: string | null })
      .enterpriseOnboardingStep;
    res.status(HttpStatusCode.FORBIDDEN).json(
      outJson(false, "Complete enterprise onboarding to access this resource.", {
        enterpriseOnboardingStep: step ?? "company_creation",
      }),
    );
    return;
  }
  next();
}
