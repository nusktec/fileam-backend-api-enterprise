import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

export const RESEND_CONFIG = {
  API_KEY: process.env.RESEND_API_KEY || "",
  FROM_EMAIL: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
  FROM_NAME: process.env.RESEND_FROM_NAME || "Slant Menu",
  REPLY_TO: process.env.RESEND_REPLY_TO || "support@slantmenu.com",
};

export const resend = new Resend(RESEND_CONFIG.API_KEY);

export const emailSender = {
  email: RESEND_CONFIG.FROM_EMAIL,
  name: RESEND_CONFIG.FROM_NAME,
  replyTo: RESEND_CONFIG.REPLY_TO,
};

export const EMAIL_CATEGORIES = {
  ACCOUNT_VERIFICATION: "account_verification",
  PASSWORD_RESET: "password_reset",
  WELCOME: "welcome",
  NOTIFICATION: "notification",
  INVITATION: "invitation",
  GENERAL: "general",
} as const;

export const EMAIL_TEMPLATE_TYPES = {
  ACCOUNT_VERIFICATION: "account_verification",
  WELCOME: "welcome",
  OTP: "otp",
  PASSWORD_RESET: "password_reset",
} as const;

export const validateResendConfig = (): boolean => {
  if (!RESEND_CONFIG.API_KEY) {
    console.error("RESEND_API_KEY is not configured");
    return false;
  }
  return true;
};
