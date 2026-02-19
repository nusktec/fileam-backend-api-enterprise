import jwt from "jsonwebtoken";

const ONBOARDING_TOKEN_EXPIRY = "1h";

export interface OnboardingTokenPayload {
  email: string;
  invitationId?: string;
  companyId?: string;
  acceptedInvitationIds?: string[];
}

export function generateOnboardingToken(payload: OnboardingTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: ONBOARDING_TOKEN_EXPIRY,
  });
}

export function verifyOnboardingToken(token: string): OnboardingTokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as OnboardingTokenPayload;
}

export function decodeOnboardingToken(token: string): OnboardingTokenPayload | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as OnboardingTokenPayload;
  } catch {
    return null;
  }
}
