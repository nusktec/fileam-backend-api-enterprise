import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { generateConsultantOnboardingToken } from "../../utils/consultantOnboardingToken";
import { consultantOnboardingService } from "../services/consultantOnboardingService";
import type {
  Step1Body,
  Step2Body,
  Step3Body,
  Step4Body,
  Step5Body,
  Step6Body,
  Step7Body,
} from "../services/consultantOnboardingService";

function hasString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function hasNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

export async function consultantOnboardingStep1(req: IRequest, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  if (
    !hasString(body.businessStructure) ||
    !hasString(body.firmName) ||
    !hasString(body.registrationType) ||
    !hasString(body.countryOfRegistration)
  ) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "businessStructure, firmName, registrationType, countryOfRegistration are required", null));
    return;
  }
  const data: Step1Body = {
    businessStructure: (body.businessStructure as string).trim(),
    firmName: (body.firmName as string).trim(),
    registrationType: (body.registrationType as string).trim(),
    countryOfRegistration: (body.countryOfRegistration as string).trim(),
    rcNumber: body.rcNumber != null ? String(body.rcNumber).trim() || undefined : undefined,
    yearOfIncorporation: body.yearOfIncorporation != null && hasNumber(Number(body.yearOfIncorporation))
      ? Number(body.yearOfIncorporation)
      : undefined,
  };
  try {
    const result = await consultantOnboardingService.step1(data);
    res.status(HttpStatusCode.CREATED).json(
      outJson(true, "Step 1 saved. Account created.", {
        consultantOnboardingToken: generateConsultantOnboardingToken(result.session.id),
        sessionId: result.session.id,
        currentStep: result.session.currentStep,
        firmIdentity: result.session.firmIdentity,
      })
    );
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to save step 1", null));
  }
}

export async function consultantOnboardingStep2(req: IRequest, res: Response): Promise<void> {
  const session = req.consultantOnboardingSession!;
  const body = req.body as Record<string, unknown>;
  const numberOfPartners = body.numberOfPartners != null ? Number(body.numberOfPartners) : 0;
  const principal = body.principalPartner as Record<string, unknown> | undefined;
  if (!principal || !hasString(principal.fullName) || !hasString(principal.email) || !hasString(principal.phone)) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "principalPartner.fullName, .email, .phone are required", null));
    return;
  }
  const certifications = Array.isArray(principal.certifications)
    ? (principal.certifications as Array<Record<string, unknown>>).map((c) => ({
        qualificationName: hasString(c.qualificationName) ? c.qualificationName : String(c.qualificationName ?? ""),
        issuingBody: hasString(c.issuingBody) ? c.issuingBody : String(c.issuingBody ?? ""),
        year: c.year != null && hasNumber(Number(c.year)) ? Number(c.year) : undefined,
        national: c.national != null ? String(c.national) : undefined,
      }))
    : [];
  const data: Step2Body = {
    numberOfPartners,
    principalPartner: {
      fullName: (principal.fullName as string).trim(),
      email: (principal.email as string).trim(),
      phone: (principal.phone as string).trim(),
      yearsOfExperience:
        principal.yearsOfExperience != null && hasNumber(Number(principal.yearsOfExperience))
          ? Number(principal.yearsOfExperience)
          : undefined,
      certifications,
    },
  };
  try {
    const result = await consultantOnboardingService.step2(session.id, data);
    if (!result.success) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
      return;
    }
    const updated = await consultantOnboardingService.getSession(session.id);
    res.status(HttpStatusCode.OK).json(outJson(true, "Step 2 saved", { currentStep: 2, session: updated }));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to save step 2", null));
  }
}

export async function consultantOnboardingStep3(req: IRequest, res: Response): Promise<void> {
  const session = req.consultantOnboardingSession!;
  const body = req.body as Record<string, unknown>;
  const additionalPartners = Array.isArray(body.additionalPartners)
    ? (body.additionalPartners as Array<Record<string, unknown>>).map((ap) => ({
        partnerName: hasString(ap.partnerName) ? (ap.partnerName as string).trim() : String(ap.partnerName ?? ""),
        role: hasString(ap.role) ? (ap.role as string).trim() : String(ap.role ?? ""),
        yearsOfExperience:
          ap.yearsOfExperience != null && hasNumber(Number(ap.yearsOfExperience))
            ? Number(ap.yearsOfExperience)
            : undefined,
        certifications: Array.isArray(ap.certifications)
          ? (ap.certifications as Array<Record<string, unknown>>).map((c) => ({
              qualification: hasString(c.qualification) ? c.qualification : String(c.qualification ?? ""),
              issuingBody: hasString(c.issuingBody) ? c.issuingBody : String(c.issuingBody ?? ""),
              national: c.national != null ? String(c.national) : undefined,
              year: c.year != null && hasNumber(Number(c.year)) ? Number(c.year) : undefined,
            }))
          : [],
      }))
    : [];
  const data: Step3Body = { additionalPartners };
  try {
    const result = await consultantOnboardingService.step3(session.id, data);
    if (!result.success) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
      return;
    }
    const updated = await consultantOnboardingService.getSession(session.id);
    res.status(HttpStatusCode.OK).json(outJson(true, "Step 3 saved", { currentStep: 3, session: updated }));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to save step 3", null));
  }
}

export async function consultantOnboardingStep4(req: IRequest, res: Response): Promise<void> {
  const session = req.consultantOnboardingSession!;
  const body = req.body as Record<string, unknown>;
  if (
    !hasString(body.primaryState) ||
    !hasString(body.businessSizeServed)
  ) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "primaryState and businessSizeServed are required", null));
    return;
  }
  const data: Step4Body = {
    primaryState: (body.primaryState as string).trim(),
    additionalStates: Array.isArray(body.additionalStates)
      ? (body.additionalStates as unknown[]).map((s) => String(s))
      : [],
    taxTypesSpecializations: Array.isArray(body.taxTypesSpecializations)
      ? (body.taxTypesSpecializations as unknown[]).map((s) => String(s))
      : [],
    businessSizeServed: (body.businessSizeServed as string).trim(),
  };
  try {
    const result = await consultantOnboardingService.step4(session.id, data);
    if (!result.success) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
      return;
    }
    const updated = await consultantOnboardingService.getSession(session.id);
    res.status(HttpStatusCode.OK).json(outJson(true, "Step 4 saved", { currentStep: 4, session: updated }));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to save step 4", null));
  }
}

export async function consultantOnboardingStep5(req: IRequest, res: Response): Promise<void> {
  const session = req.consultantOnboardingSession!;
  const body = req.body as Record<string, unknown>;
  if (!hasString(body.billingOption)) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "billingOption is required", null));
    return;
  }
  const perFilingReminderConfig = Array.isArray(body.perFilingReminderConfig)
    ? (body.perFilingReminderConfig as Array<Record<string, unknown>>).map((r) => ({
        filing: String(r.filing ?? ""),
        frequency: String(r.frequency ?? ""),
        reminderDates: Array.isArray(r.reminderDates) ? (r.reminderDates as number[]) : [],
      }))
    : undefined;
  const data: Step5Body = {
    billingOption: (body.billingOption as string).trim(),
    enableAutomatedComplianceReminders: Boolean(body.enableAutomatedComplianceReminders),
    perFilingReminderConfig,
  };
  try {
    const result = await consultantOnboardingService.step5(session.id, data);
    if (!result.success) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
      return;
    }
    const updated = await consultantOnboardingService.getSession(session.id);
    res.status(HttpStatusCode.OK).json(outJson(true, "Step 5 saved", { currentStep: 5, session: updated }));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to save step 5", null));
  }
}

export async function consultantOnboardingStep6(req: IRequest, res: Response): Promise<void> {
  const session = req.consultantOnboardingSession!;
  const body = req.body as Record<string, unknown>;
  if (!hasString(body.paymentMethod)) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "paymentMethod is required", null));
    return;
  }
  const data: Step6Body = {
    paymentMethod: (body.paymentMethod as string).trim(),
    bankAccountNumber: body.bankAccountNumber != null ? String(body.bankAccountNumber).trim() || undefined : undefined,
    warrantApproval: body.warrantApproval != null ? String(body.warrantApproval).trim() || undefined : undefined,
    selfRemittance: body.selfRemittance != null ? String(body.selfRemittance).trim() || undefined : undefined,
  };
  try {
    const result = await consultantOnboardingService.step6(session.id, data);
    if (!result.success) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
      return;
    }
    const updated = await consultantOnboardingService.getSession(session.id);
    res.status(HttpStatusCode.OK).json(outJson(true, "Step 6 saved", { currentStep: 6, session: updated }));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to save step 6", null));
  }
}

export async function consultantOnboardingStep7(req: IRequest, res: Response): Promise<void> {
  const session = req.consultantOnboardingSession!;
  const body = req.body as Record<string, unknown>;
  if (
    typeof body.declarationAccuracy !== "boolean" ||
    typeof body.declarationFirsCompliance !== "boolean" ||
    typeof body.declarationSuspensionPolicy !== "boolean"
  ) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(
        outJson(
          false,
          "declarationAccuracy, declarationFirsCompliance, declarationSuspensionPolicy are required booleans",
          null
        )
      );
    return;
  }
  const data: Step7Body = {
    cacDocumentUrl: body.cacDocumentUrl != null ? String(body.cacDocumentUrl).trim() || undefined : undefined,
    principalPartnerIdUrl:
      body.principalPartnerIdUrl != null ? String(body.principalPartnerIdUrl).trim() || undefined : undefined,
    professionalCertificateUrl:
      body.professionalCertificateUrl != null
        ? String(body.professionalCertificateUrl).trim() || undefined
        : undefined,
    amlDocumentUrl: body.amlDocumentUrl != null ? String(body.amlDocumentUrl).trim() || undefined : undefined,
    firmProfileUrl: body.firmProfileUrl != null ? String(body.firmProfileUrl).trim() || undefined : undefined,
    declarationAccuracy: body.declarationAccuracy,
    declarationFirsCompliance: body.declarationFirsCompliance,
    declarationSuspensionPolicy: body.declarationSuspensionPolicy,
    saveAsDraft: Boolean(body.saveAsDraft),
  };
  try {
    const result = await consultantOnboardingService.step7(session.id, data);
    if (!result.success) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
      return;
    }
    const updated = await consultantOnboardingService.getSession(session.id);
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(
          true,
          data.saveAsDraft ? "Step 7 saved as draft" : "Step 7 submitted for review",
          { currentStep: 7, status: updated?.status, session: updated }
        )
      );
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to save step 7", null));
  }
}

export async function consultantOnboardingProfile(req: IRequest, res: Response): Promise<void> {
  const session = req.consultantOnboardingSession!;
  try {
    const full = await consultantOnboardingService.getSession(session.id);
    if (!full) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Session not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Consultant onboarding profile", full));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load profile", null));
  }
}

export async function consultantOnboardingReviewSubmit(req: IRequest, res: Response): Promise<void> {
  const session = req.consultantOnboardingSession!;
  try {
    const result = await consultantOnboardingService.reviewAndSubmit(session.id);
    if (!result.success) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Submitted for review. Documents will be reviewed in 24–48 hours.", null));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to submit for review", null));
  }
}

export async function consultantOnboardingActivate(req: IRequest, res: Response): Promise<void> {
  const session = req.consultantOnboardingSession!;
  try {
    const result = await consultantOnboardingService.activate(session.id);
    if (!result.success) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, result.message, null));
      return;
    }
    const updated = await consultantOnboardingService.getSession(session.id);
    res.status(HttpStatusCode.OK).json(outJson(true, "Account activated", { status: updated?.status, currentStep: 8 }));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to activate", null));
  }
}
