import { Response, NextFunction } from "express";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { IRequest } from "../interfaces/CustomRequest";

export function requireOnboardingComplete(
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
  if (!user.onboardingComplete) {
    res.status(HttpStatusCode.FORBIDDEN).json(
      outJson(false, "Complete onboarding to continue.", {
        currentOnboardingStep: user.currentOnboardingStep ?? "income_type",
      }),
    );
    return;
  }
  next();
}
