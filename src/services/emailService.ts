import fs from "fs";
import path from "path";
import { 
  resend, 
  emailSender, 
  EMAIL_CATEGORIES, 
  EMAIL_TEMPLATE_TYPES,
  validateResendConfig 
} from "../config/resend";
import {
  EmailCategoryInterface,
  EmailCategoryType,
} from "../interfaces/system";

const getEmailTemplate = (templateName: string): string => {
  try {
    const templatePath = path.join(__dirname, "template", `${templateName}.mail`);
    return fs.readFileSync(templatePath, "utf-8");
  } catch (error) {
    console.error(`Error reading template ${templateName}:`, error);
    return "";
  }
};

const renderTemplate = (template: string, data: Record<string, any>): string => {
  return template.replace(/{{(.*?)}}/g, (match: string) => {
    const key = match.split(/{{|}}/).filter(Boolean)[0];
    const value = data[key];
    if (value instanceof Array) return value.join("\n");
    return value || "";
  });
};

const sanitizeTag = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
};

const sendEmail = async (
  to: string,
  subject: string,
  htmlContent: string,
  category: string = EMAIL_CATEGORIES.GENERAL,
  tags: Array<{ name: string; value: string }> = []
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    if (!validateResendConfig()) {
      throw new Error("Resend configuration is invalid");
    }

    const { data, error } = await resend.emails.send({
      from: `${emailSender.name} <${emailSender.email}>`,
      to: [to],
      subject,
      html: htmlContent,
      replyTo: emailSender.replyTo,
      tags: [
        {
          name: "category",
          value: sanitizeTag(category),
        },
        ...tags,
      ],
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { success: false, error };
  }
};

const sendVerificationEmail = async (
  to: string,
  name: string,
  verificationCode: string,
  templateType: string = EMAIL_TEMPLATE_TYPES.ACCOUNT_VERIFICATION
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
      "Verify Your Email - Slant Menu",
      htmlContent,
      EMAIL_CATEGORIES.ACCOUNT_VERIFICATION,
      [{ name: "type", value: "verification" }]
    );
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return { success: false, error };
  }
};

const sendOtpEmail = async (
  to: string,
  name: string,
  otpCode: string
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
      "Your Secure Access Code - Slant Menu",
      htmlContent,
      EMAIL_CATEGORIES.ACCOUNT_VERIFICATION,
      [{ name: "type", value: "otp" }]
    );
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    return { success: false, error };
  }
};

const sendWelcomeEmail = async (
  to: string,
  name: string
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate(EMAIL_TEMPLATE_TYPES.WELCOME);
    if (!template) {
      throw new Error("Welcome template not found");
    }

    const htmlContent = renderTemplate(template, {
      name,
      body: "Welcome to Slant Menu! Your account has been successfully created.",
    });

    return await sendEmail(
      to,
      "Welcome to Slant Menu!",
      htmlContent,
      EMAIL_CATEGORIES.WELCOME,
      [{ name: "type", value: "welcome" }]
    );
  } catch (error) {
    console.error("Failed to send welcome email:", error);
    return { success: false, error };
  }
};

const SendMail = async (
  category: string,
  subject: string,
  name: string,
  body: string,
  to: string
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate("verification");
    if (!template) {
      throw new Error("Verification template not found");
    }

    const htmlContent = renderTemplate(template, { body, name });

    return await sendEmail(
      to,
      subject,
      htmlContent,
      category
    );
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
  to: string
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate("verification");
    if (!template) {
      throw new Error("Verification template not found");
    }

    const htmlContent = renderTemplate(template, { body, name });

    return await sendEmail(
      to,
      subject,
      htmlContent,
      category,
      [{ name: "type", value: "invitation" }]
    );
  } catch (error) {
    console.error("Failed to send invite email:", error);
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
  EmailCategoryEnum,
  sendEmail,
  sendVerificationEmail,
  sendOtpEmail,
  sendWelcomeEmail,
  validateResendConfig
};
