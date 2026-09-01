import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { onboardingService } from "../../services/onboardingService";
import { extractOptionalBusinessProfileFields } from "../../constants/businessProfile";
import { HttpReplyError } from "../../utils/httpReplyError";

export async function stepEmail(req: IRequest, res: Response): Promise<void> {
  const { email, firstName } = req.body;
  if (!email) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Email is required", null));
    return;
  }
  const result = await onboardingService.stepEmail(email, firstName);
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

export async function resendStepEmail(
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
  const result = await onboardingService.resendStepEmail(email, firstName);
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, result.data ?? null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Verification email resent", result.data));
}

export async function stepEmailVerify(
  req: IRequest,
  res: Response,
): Promise<void> {
  const { email, code, invitationId, consultantUserId } = req.body;
  if (!email || !code) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Email and code are required", null));
    return;
  }
  const result = await onboardingService.stepEmailVerify(
    email,
    code,
    invitationId,
    consultantUserId,
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
  const result = await onboardingService.stepPassword(
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
    .json(outJson(true, "Account created", result.data));
}

export async function stepTaxPersona(
  req: IRequest,
  res: Response,
): Promise<void> {
  const payload = req.onboardingPayload!;
  const { taxPersona, solopreneurRegistration, employmentGrossSalaryMonthly } =
    req.body as {
      taxPersona?: string;
      solopreneurRegistration?: string;
      employmentGrossSalaryMonthly?: unknown;
    };
  if (!taxPersona || typeof taxPersona !== "string") {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "taxPersona is required", null));
    return;
  }
  let salaryPatch: number | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "employmentGrossSalaryMonthly")) {
    const v = employmentGrossSalaryMonthly;
    if (v === null) {
      salaryPatch = null;
    } else if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      salaryPatch = v;
    } else {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(
            false,
            "employmentGrossSalaryMonthly must be a non-negative number or null",
            null,
          ),
        );
      return;
    }
  }
  const result = await onboardingService.stepTaxPersona(
    payload,
    taxPersona,
    solopreneurRegistration,
    salaryPatch,
  );
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Tax persona saved", result.data));
}

export async function stepIncomeType(
  req: IRequest,
  res: Response,
): Promise<void> {
  const payload = req.onboardingPayload!;
  const { incomeType } = req.body;
  if (!incomeType) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "incomeType is required", null));
    return;
  }
  const result = await onboardingService.stepIncomeType(payload, incomeType);
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Income type saved", result.data));
}

export async function stepTaxObligations(
  req: IRequest,
  res: Response,
): Promise<void> {
  const payload = req.onboardingPayload!;
  const result = await onboardingService.stepTaxObligations(payload);
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Tax obligations acknowledged", result.data));
}

export async function stepBusinessDetails(
  req: IRequest,
  res: Response,
): Promise<void> {
  const payload = req.onboardingPayload!;
  const {
    name,
    businessIdNumber,
    tin,
    streetAddress,
    stateOfResidence,
    primaryTaxOffice,
  } = req.body;
  if (!name) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Business name is required", null));
    return;
  }

  const stepData: Parameters<typeof onboardingService.stepBusinessDetails>[1] = {
    name,
    businessIdNumber,
    tin,
    streetAddress,
    stateOfResidence,
    primaryTaxOffice,
  };

  try {
    Object.assign(stepData, extractOptionalBusinessProfileFields(req.body));
  } catch (e) {
    if (e instanceof HttpReplyError) {
      res.status(e.statusCode).json(outJson(false, e.message, null));
      return;
    }
    throw e;
  }

  try {
    const result = await onboardingService.stepBusinessDetails(payload, stepData);
    if (!result.success) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, result.message, null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Business details saved", result.data));
  } catch (e) {
    if (e instanceof HttpReplyError) {
      res.status(e.statusCode).json(outJson(false, e.message, null));
      return;
    }
    throw e;
  }
}

export async function stepTaxJurisdiction(
  req: IRequest,
  res: Response,
): Promise<void> {
  const payload = req.onboardingPayload!;
  const { primaryTaxOffice, stateOfResidence } = req.body;
  const result = await onboardingService.stepTaxJurisdiction(payload, {
    primaryTaxOffice,
    stateOfResidence,
  });
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Tax jurisdiction saved", result.data));
}

export async function stepConsultantTerms(
  req: IRequest,
  res: Response,
): Promise<void> {
  const payload = req.onboardingPayload!;
  const result = await onboardingService.stepConsultantTerms(payload);
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Onboarding complete", result.data));
}

export async function getOnboardingProfile(
  req: IRequest,
  res: Response,
): Promise<void> {
  const payload = req.onboardingPayload!;
  const result = await onboardingService.getOnboardingProfile(payload);
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Failed to get profile", null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Profile retrieved", result.data));
}

export async function inviteVerifyCode(
  req: IRequest,
  res: Response,
): Promise<void> {
  const { code } = req.body;
  if (!code) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Invitation code is required", null));
    return;
  }
  const result = await onboardingService.verifyInviteCode(code);
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Invitation valid", result.data));
}

export async function inviteAcceptRequest(
  req: IRequest,
  res: Response,
): Promise<void> {
  const payload = req.onboardingPayload!;
  const { invitationId } = req.body;
  if (!invitationId) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "invitationId is required", null));
    return;
  }
  const result = await onboardingService.acceptRequest(payload, invitationId);
  if (!result.success) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, result.message, null));
    return;
  }
  res
    .status(HttpStatusCode.OK)
    .json(
      outJson(
        true,
        "Invitation accepted",
        result.data as { onboardingToken: string },
      ),
    );
}

export async function inviteRejectRequest(
  req: IRequest,
  res: Response,
): Promise<void> {
  const payload = req.onboardingPayload!;
  const { invitationId } = req.body;
  if (!invitationId) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "invitationId is required", null));
    return;
  }
  const result = await onboardingService.rejectRequest(payload, invitationId);
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Invitation rejected", result.data));
}
