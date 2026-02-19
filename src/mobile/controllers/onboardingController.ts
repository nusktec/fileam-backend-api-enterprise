import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { onboardingService } from "../../services/onboardingService";

export async function stepEmail(req: IRequest, res: Response): Promise<void> {
  const { email, firstName } = req.body;
  if (!email) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Email is required", null));
    return;
  }
  const result = await onboardingService.stepEmail(email, firstName);
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Verification email sent", result.data));
}

export async function stepEmailVerify(req: IRequest, res: Response): Promise<void> {
  const { email, code, invitationId, companyId } = req.body;
  if (!email || !code) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Email and code are required", null));
    return;
  }
  const result = await onboardingService.stepEmailVerify(email, code, invitationId, companyId);
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Email verified", result.data));
}

export async function stepPassword(req: IRequest, res: Response): Promise<void> {
  const payload = req.onboardingPayload!;
  const { password, firstName, lastName } = req.body;
  if (!password) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Password is required", null));
    return;
  }
  const result = await onboardingService.stepPassword(payload, password, firstName, lastName);
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Account created", result.data));
}

export async function stepIncomeType(req: IRequest, res: Response): Promise<void> {
  const payload = req.onboardingPayload!;
  const { incomeType } = req.body;
  if (!incomeType) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "incomeType is required", null));
    return;
  }
  const result = await onboardingService.stepIncomeType(payload, incomeType);
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Income type saved", result.data));
}

export async function stepTaxObligations(req: IRequest, res: Response): Promise<void> {
  const payload = req.onboardingPayload!;
  const result = await onboardingService.stepTaxObligations(payload);
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Tax obligations acknowledged", result.data));
}

export async function stepBusinessDetails(req: IRequest, res: Response): Promise<void> {
  const payload = req.onboardingPayload!;
  const { name, businessIdNumber, tin, streetAddress, stateOfResidence, primaryTaxOffice } = req.body;
  if (!name) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Business name is required", null));
    return;
  }
  const result = await onboardingService.stepBusinessDetails(payload, {
    name,
    businessIdNumber,
    tin,
    streetAddress,
    stateOfResidence,
    primaryTaxOffice,
  });
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Business details saved", result.data));
}

export async function stepTaxJurisdiction(req: IRequest, res: Response): Promise<void> {
  const payload = req.onboardingPayload!;
  const { primaryTaxOffice, stateOfResidence } = req.body;
  const result = await onboardingService.stepTaxJurisdiction(payload, {
    primaryTaxOffice,
    stateOfResidence,
  });
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Tax jurisdiction saved", result.data));
}

export async function stepConsultantTerms(req: IRequest, res: Response): Promise<void> {
  const payload = req.onboardingPayload!;
  const result = await onboardingService.stepConsultantTerms(payload);
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Onboarding complete", result.data));
}

export async function getOnboardingProfile(req: IRequest, res: Response): Promise<void> {
  const payload = req.onboardingPayload!;
  const result = await onboardingService.getOnboardingProfile(payload);
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Failed to get profile", null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Profile retrieved", result.data));
}

export async function inviteVerifyCode(req: IRequest, res: Response): Promise<void> {
  const { code } = req.body;
  if (!code) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Invitation code is required", null));
    return;
  }
  const result = await onboardingService.verifyInviteCode(code);
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Invitation valid", result.data));
}

export async function inviteAcceptRequest(req: IRequest, res: Response): Promise<void> {
  const payload = req.onboardingPayload!;
  const { invitationId } = req.body;
  if (!invitationId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "invitationId is required", null));
    return;
  }
  const result = await onboardingService.acceptRequest(payload, invitationId);
  if (!result.success) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Invitation accepted", result.data as { onboardingToken: string }));
}

export async function inviteRejectRequest(req: IRequest, res: Response): Promise<void> {
  const payload = req.onboardingPayload!;
  const { invitationId } = req.body;
  if (!invitationId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "invitationId is required", null));
    return;
  }
  await onboardingService.rejectRequest(payload, invitationId);
  res.status(HttpStatusCode.OK).json(outJson(true, "Invitation rejected", null));
}
