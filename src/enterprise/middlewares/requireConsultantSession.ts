import { Response, NextFunction } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";

export function requireConsultantSession(
  req: IRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.consultantOnboardingSession) {
    res.status(HttpStatusCode.FORBIDDEN).json(
      outJson(
        false,
        "No consultant onboarding session found. Complete step 1 (firm identity) first.",
        null,
      ),
    );
    return;
  }
  next();
}
