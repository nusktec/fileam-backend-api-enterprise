import fs from "fs";
import path from "path";
import {
  smtpTransporter,
  emailSender,
  EMAIL_CATEGORIES,
  EMAIL_TEMPLATE_TYPES,
  validateEmailConfig,
} from "../config/smtp";
import { EmailCategoryInterface } from "../interfaces/system";
import { EmailTemplate_PASSWORD_RESET } from "./template/emailTemplates";

const getEmailTemplate = (templateName: string): string => {
  try {
    const templatePath = path.join(
      __dirname,
      "template",
      `${templateName}.mail`,
    );
    return fs.readFileSync(templatePath, "utf-8");
  } catch (error) {
    console.error(`Error reading template ${templateName}:`, error);
    return "";
  }
};

const renderTemplate = (
  template: string,
  data: Record<string, any>,
): string => {
  return template.replace(/{{(.*?)}}/g, (match: string) => {
    const key = match.split(/{{|}}/).filter(Boolean)[0];
    const value = data[key];
    if (value instanceof Array) return value.join("\n");
    return value || "";
  });
};

const sendEmail = async (
  to: string,
  subject: string,
  htmlContent: string,
  _category: string = EMAIL_CATEGORIES.GENERAL,
  _tags: Array<{ name: string; value: string }> = [],
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    if (!validateEmailConfig()) {
      throw new Error("SMTP configuration is invalid");
    }

    const info = await smtpTransporter.sendMail({
      from: `${emailSender.name} <${emailSender.email}>`,
      to,
      replyTo: emailSender.replyTo,
      subject,
      html: htmlContent,
    });

    return { success: true, data: info };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { success: false, error };
  }
};

const sendVerificationEmail = async (
  to: string,
  name: string,
  verificationCode: string,
  templateType: string = EMAIL_TEMPLATE_TYPES.ACCOUNT_VERIFICATION,
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate(templateType);
    if (!template) {
      throw new Error(`Template ${templateType} not found`);
    }

    const htmlContent = renderTemplate(template, {
      name,
      verificationCode,
      email: to,
    });

    return await sendEmail(
      to,
      "Verify Your Email - Fileam",
      htmlContent,
      EMAIL_CATEGORIES.ACCOUNT_VERIFICATION,
    );
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return { success: false, error };
  }
};

const sendOtpEmail = async (
  to: string,
  name: string,
  otpCode: string,
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate(EMAIL_TEMPLATE_TYPES.OTP);
    if (!template) {
      throw new Error("OTP template not found");
    }

    const htmlContent = renderTemplate(template, {
      name,
      otpCode,
      email: to,
    });

    return await sendEmail(
      to,
      "Your Secure Access Code - Fileam",
      htmlContent,
      EMAIL_CATEGORIES.ACCOUNT_VERIFICATION,
    );
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    return { success: false, error };
  }
};

const sendWelcomeEmail = async (
  to: string,
  name: string,
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate(EMAIL_TEMPLATE_TYPES.WELCOME);
    if (!template) {
      throw new Error("Welcome template not found");
    }

    const htmlContent = renderTemplate(template, {
      name,
      body: "Welcome to Fileam! Your account has been successfully created.",
    });

    return await sendEmail(
      to,
      "Welcome to Fileam!",
      htmlContent,
      EMAIL_CATEGORIES.WELCOME,
    );
  } catch (error) {
    console.error("Failed to send welcome email:", error);
    return { success: false, error };
  }
};

const sendPasswordResetEmail = async (
  to: string,
  name: string,
  code: string,
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const htmlContent = EmailTemplate_PASSWORD_RESET(code, name);
    return await sendEmail(
      to,
      "Reset Your Password - Fileam",
      htmlContent,
      EMAIL_CATEGORIES.PASSWORD_RESET,
    );
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return { success: false, error };
  }
};

const SendMail = async (
  category: string,
  subject: string,
  name: string,
  body: string,
  to: string,
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate("verification");
    if (!template) {
      throw new Error("Verification template not found");
    }

    const htmlContent = renderTemplate(template, { body, name });

    return await sendEmail(to, subject, htmlContent, category);
  } catch (error) {
    console.error("Failed to send legacy email:", error);
    return { success: false, error };
  }
};

const SendInviteMail = async (
  category: string,
  subject: string,
  name: string,
  body: string,
  to: string,
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate("verification");
    if (!template) {
      throw new Error("Verification template not found");
    }

    const htmlContent = renderTemplate(template, { body, name });

    return await sendEmail(to, subject, htmlContent, category);
  } catch (error) {
    console.error("Failed to send invite email:", error);
    return { success: false, error };
  }
};

const sendInvitationToJoinEmail = async (
  to: string,
  recipientName: string,
  invitationCode: string,
  expiresAt: Date,
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate(EMAIL_TEMPLATE_TYPES.INVITATION);
    if (!template) {
      throw new Error("Invitation template not found");
    }
    const expiryFormatted = expiresAt.toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
    const htmlContent = renderTemplate(template, {
      name: recipientName || to,
      invitationCode,
      expiryDate: expiryFormatted,
    });
    return await sendEmail(
      to,
      "You're invited to join Fileam",
      htmlContent,
      EMAIL_CATEGORIES.INVITATION,
    );
  } catch (error) {
    console.error("Failed to send invitation email:", error);
    return { success: false, error };
  }
};

const EmailCategoryEnum: EmailCategoryInterface = Object.freeze({
  PASSWORD_RESET: "Password Reset",
  ORDER_CONFIRMATION: "Order Confirmation",
  SHIPPING_NOTIFICATION: "Shipping Notification",
  ACCOUNT_CREATION: "Account Creation",
  INVOICE: "Invoice",
  PROMOTIONAL: "Promotional",
  NEWSLETTER: "Newsletter",
  EVENT_INVITATION: "Event Invitation",
  PRODUCT_LAUNCH: "Product Launch",
  ABANDONED_CART: "Abandoned Cart",
  CUSTOMER_SUPPORT: "Customer Support",
  FEEDBACK_SURVEYS: "Feedback/Surveys",
  ISSUE_RESOLUTION: "Issue Resolution",
  ACCOUNT_ALERTS: "Account Alerts",
  SYSTEM_ALERTS: "System Alerts",
  USAGE_REPORTS: "Usage Reports",
  SUBSCRIPTION_RENEWAL: "Subscription Renewal",
  PRIVACY_POLICY_UPDATE: "Privacy Policy Update",
  GDPR_COMPLIANCE: "GDPR Compliance",
  TEAM_ANNOUNCEMENTS: "Team Announcements",
  MEETING_INVITATIONS: "Meeting Invitations",
  NEW_FOLLOWER_CONNECTION: "New Follower/Connection",
  COMMENT_MENTION: "Comment or Mention",
  FRIEND_REQUEST: "Friend Request",
  GENERAL: "General Information",
});

export {
  SendMail,
  SendInviteMail,
  sendInvitationToJoinEmail,
  EmailCategoryEnum,
  sendEmail,
  sendVerificationEmail,
  sendOtpEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  validateEmailConfig,
};
