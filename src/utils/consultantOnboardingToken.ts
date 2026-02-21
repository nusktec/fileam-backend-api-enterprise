import jwt from "jsonwebtoken";

const CONSULTANT_ONBOARDING_TOKEN_EXPIRY = "30d";

export interface ConsultantOnboardingTokenPayload {
  sessionId: string;
}

export function generateConsultantOnboardingToken(sessionId: string): string {
  return jwt.sign(
    { sessionId } as ConsultantOnboardingTokenPayload,
    process.env.JWT_SECRET!,
    { expiresIn: CONSULTANT_ONBOARDING_TOKEN_EXPIRY },
  );
}

export function verifyConsultantOnboardingToken(
  token: string,
): ConsultantOnboardingTokenPayload | null {
  try {
    return jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as ConsultantOnboardingTokenPayload;
  } catch {
    return null;
  }
}
