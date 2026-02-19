import { prisma } from "../config/database";
import {
  sendVerificationEmail,
  sendOtpEmail,
  sendWelcomeEmail,
} from "./emailService";
import { RandomAscii } from "../utils/tools";
import { EMAIL_TEMPLATE_TYPES } from "../config/smtp";

export interface VerificationResult {
  success: boolean;
  message: string;
  data?: any;
  error?: any;
}

export class EmailVerificationService {
  private static readonly OTP_EXPIRY_MINUTES = 10;
  private static readonly OTP_LENGTH = 6;
  private static readonly MAX_ATTEMPTS = 3;

  static async generateAndSendVerification(
    email: string,
    name: string,
    type: string = "verification",
  ): Promise<VerificationResult> {
    try {
      const otpCode = RandomAscii(this.OTP_LENGTH);
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

      await prisma.emailVerification.upsert({
        where: { email },
        create: { email, code: otpCode, type, expiresAt, attempts: 0 },
        update: {
          code: otpCode,
          type,
          expiresAt,
          attempts: 0,
          isVerified: false,
        },
      });

      const templateType =
        type === "onboarding_verification"
          ? EMAIL_TEMPLATE_TYPES.ONBOARDING_VERIFICATION
          : EMAIL_TEMPLATE_TYPES.ACCOUNT_VERIFICATION;
      const emailResult = await sendVerificationEmail(
        email,
        name,
        otpCode,
        templateType,
      );

      if (!emailResult.success) {
        return {
          success: false,
          message: "Failed to send verification email",
          error: emailResult.error,
        };
      }

      return {
        success: true,
        message: "Verification email sent successfully",
        data: { email, expiresAt, type },
      };
    } catch (error) {
      console.error("Error generating verification:", error);
      return { success: false, message: "Internal server error", error };
    }
  }

  static async generateAndSendOtp(
    email: string,
    name: string,
    type: string = "otp",
  ): Promise<VerificationResult> {
    try {
      const otpCode = RandomAscii(this.OTP_LENGTH);
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

      await prisma.emailVerification.upsert({
        where: { email },
        create: { email, code: otpCode, type, expiresAt, attempts: 0 },
        update: {
          code: otpCode,
          type,
          expiresAt,
          attempts: 0,
          isVerified: false,
        },
      });

      const emailResult = await sendOtpEmail(email, name, otpCode);

      if (!emailResult.success) {
        return {
          success: false,
          message: "Failed to send OTP email",
          error: emailResult.error,
        };
      }

      return {
        success: true,
        message: "OTP email sent successfully",
        data: { email, expiresAt, type },
      };
    } catch (error) {
      console.error("Error generating OTP:", error);
      return { success: false, message: "Internal server error", error };
    }
  }

  static async verifyOtp(
    email: string,
    code: string,
  ): Promise<VerificationResult> {
    try {
      const record = await prisma.emailVerification.findUnique({
        where: { email },
      });

      if (!record) {
        return { success: false, message: "Verification record not found" };
      }
      if (record.isVerified) {
        return { success: false, message: "Email already verified" };
      }
      if (new Date() > record.expiresAt) {
        return { success: false, message: "Verification code has expired" };
      }
      if (record.attempts >= this.MAX_ATTEMPTS) {
        return {
          success: false,
          message: "Maximum verification attempts exceeded",
        };
      }

      await prisma.emailVerification.update({
        where: { email },
        data: { attempts: record.attempts + 1 },
      });

      if (record.code !== code) {
        return { success: false, message: "Invalid verification code" };
      }

      await prisma.emailVerification.update({
        where: { email },
        data: { isVerified: true },
      });

      return {
        success: true,
        message: "Email verified successfully",
        data: { email, verifiedAt: new Date() },
      };
    } catch (error) {
      console.error("Error verifying OTP:", error);
      return { success: false, message: "Internal server error", error };
    }
  }

  static async resendVerification(
    email: string,
    name: string,
    type: string = "verification",
  ): Promise<VerificationResult> {
    try {
      const existing = await prisma.emailVerification.findUnique({
        where: { email },
      });
      if (existing?.isVerified) {
        return { success: false, message: "Email is already verified" };
      }
      return await this.generateAndSendVerification(email, name, type);
    } catch (error) {
      console.error("Error resending verification:", error);
      return { success: false, message: "Internal server error", error };
    }
  }

  static async sendWelcomeEmail(
    email: string,
    name: string,
  ): Promise<VerificationResult> {
    try {
      const emailResult = await sendWelcomeEmail(email, name);
      if (!emailResult.success) {
        return {
          success: false,
          message: "Failed to send welcome email",
          error: emailResult.error,
        };
      }
      return { success: true, message: "Welcome email sent successfully" };
    } catch (error) {
      console.error("Error sending welcome email:", error);
      return { success: false, message: "Internal server error", error };
    }
  }

  static async cleanupExpiredRecords(): Promise<void> {
    try {
      await prisma.emailVerification.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
    } catch (error) {
      console.error("Error cleaning up expired records:", error);
    }
  }
}
