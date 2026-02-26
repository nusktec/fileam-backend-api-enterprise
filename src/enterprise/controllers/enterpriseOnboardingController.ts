import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { enterpriseOnboardingService } from "../../services/enterpriseOnboardingService";

export async function stepEmail(
  req: IRequest,
  res: Response,
): Promise<void> {
  const { email, firstName } = req.body;
  if (!email) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Email is required", null));
    return;
  }
  const result = await enterpriseOnboardingService.stepEmail(email, firstName);
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, result.data ?? null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Verification email sent", result.data));
}

export async function stepEmailVerify(
  req: IRequest,
  res: Response,
): Promise<void> {
  const { email, code, invitationId, companyId } = req.body;
  if (!email || !code) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Email and code are required", null));
    return;
  }
  const result = await enterpriseOnboardingService.stepEmailVerify(
    email,
    code,
    invitationId,
    companyId,
  );
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Email verified", result.data));
}

export async function stepPassword(
  req: IRequest,
  res: Response,
): Promise<void> {
  const payload = req.onboardingPayload!;
  const { password, firstName, lastName } = req.body;
  if (!password) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Password is required", null));
    return;
  }
  const result = await enterpriseOnboardingService.stepPassword(
    payload,
    password,
    firstName,
    lastName,
  );
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, result.data?.message ?? "Account ready", result.data));
}
