import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

export const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || "",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true",
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  from:
    process.env.SMTP_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    "noreply@file-am.com",
  fromName:
    process.env.SMTP_FROM_NAME || process.env.RESEND_FROM_NAME || "file-am",
  replyTo:
    process.env.SMTP_REPLY_TO ||
    process.env.RESEND_REPLY_TO ||
    "support@file-am.com",
};

const createTransporter = () => {
  return nodemailer.createTransport({
    host: SMTP_CONFIG.host,
    port: SMTP_CONFIG.port,
    secure: SMTP_CONFIG.secure,
    auth:
      SMTP_CONFIG.user && SMTP_CONFIG.pass
        ? { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass }
        : undefined,
  });
};

export const smtpTransporter = createTransporter();

export const emailSender = {
  email: SMTP_CONFIG.from,
  name: SMTP_CONFIG.fromName,
  replyTo: SMTP_CONFIG.replyTo,
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

export const validateEmailConfig = (): boolean => {
  if (!SMTP_CONFIG.host) {
    console.error("SMTP_HOST is not configured");
    return false;
  }
  return true;
};
