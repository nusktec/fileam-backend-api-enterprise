import fs from "fs";
import path from "path";
import {
  smtpTransporter,
  emailSender,
  EMAIL_CATEGORIES,
  EMAIL_TEMPLATE_TYPES,
  validateEmailConfig,
} from "../config/smtp";
import {
  EmailTemplate_PASSWORD_RESET,
  EmailTemplate_TEAM_INVITATION,
} from "./template/emailTemplates";

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

/**
 * Public base URL for invitation accept/decline links in emails.
 * Use INVITATION_LINK_BASE_URL in production so links hit the API host, not the frontend (BASE_URL is often the web app).
 */
function getInvitationLinkBaseUrl(): string {
  const raw =
    process.env.INVITATION_LINK_BASE_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    "https://fileam.app";
  return raw.replace(/\/+$/, "");
}

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

const sendConsultantRequestEmail = async (
  to: string,
  recipientName: string,
  consultantName: string,
  invitationId: string,
  code: string,
  expiresAt: Date,
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate(EMAIL_TEMPLATE_TYPES.CONSULTANT_REQUEST);
    if (!template) {
      throw new Error("Consultant request template not found");
    }
    const baseUrl = getInvitationLinkBaseUrl();
    const acceptUrl = `${baseUrl}/api/v${process.env.API_VERSION || "1"}/invitations/${invitationId}/accept/${code}`;
    const declineUrl = `${baseUrl}/api/v${process.env.API_VERSION || "1"}/invitations/${invitationId}/decline/${code}`;
    const expiryFormatted = expiresAt.toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
    const htmlContent = renderTemplate(template, {
      name: recipientName || to,
      consultantName,
      acceptUrl,
      declineUrl,
      expiryDate: expiryFormatted,
    });
    return await sendEmail(
      to,
      "Consultant Request - Fileam",
      htmlContent,
      EMAIL_CATEGORIES.INVITATION,
    );
  } catch (error) {
    console.error("Failed to send consultant request email:", error);
    return { success: false, error };
  }
};

/** Email to consultant when a mobile client requests to connect (accept/decline in link). */
const sendConsultantIncomingClientRequestEmail = async (
  to: string,
  consultantRecipientName: string,
  clientName: string,
  invitationId: string,
  code: string,
  expiresAt: Date,
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const template = getEmailTemplate(
      EMAIL_TEMPLATE_TYPES.CONSULTANT_INCOMING_REQUEST,
    );
    if (!template) {
      throw new Error("Consultant incoming request template not found");
    }
    const baseUrl = getInvitationLinkBaseUrl();
    const acceptUrl = `${baseUrl}/api/v${process.env.API_VERSION || "1"}/invitations/${invitationId}/accept/${code}`;
    const declineUrl = `${baseUrl}/api/v${process.env.API_VERSION || "1"}/invitations/${invitationId}/decline/${code}`;
    const expiryFormatted = expiresAt.toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
    const htmlContent = renderTemplate(template, {
      name: consultantRecipientName || to,
      clientName,
      acceptUrl,
      declineUrl,
      expiryDate: expiryFormatted,
    });
    return await sendEmail(
      to,
      "Client connection request - Fileam",
      htmlContent,
      EMAIL_CATEGORIES.INVITATION,
    );
  } catch (error) {
    console.error("Failed to send consultant incoming request email:", error);
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

/** Consultant notified when a linked client enables filing authorization. */
const sendConsultantFilingAuthorizationEmail = async (
  to: string,
  consultantGreetingName: string,
  businessDisplayName: string,
): Promise<{ success: boolean; error?: unknown }> => {
  try {
    const htmlContent = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px;">
  <p>Hi ${escapeHtml(consultantGreetingName)},</p>
  <p><strong>${escapeHtml(businessDisplayName)}</strong> has authorized you to file tax returns on their behalf in Fileam.</p>
  <p>You can submit filings for this client from your consultant workflow when you are ready.</p>
  <p style="color:#666;font-size:14px;">If you were not expecting this, the client can turn off filing authorization in their app under Consultant settings.</p>
  <p>— Fileam</p>
</body></html>`;
    return await sendEmail(
      to,
      "Client authorized you to file on their behalf - Fileam",
      htmlContent,
      EMAIL_CATEGORIES.NOTIFICATION,
    );
  } catch (error) {
    console.error("Failed to send filing authorization email:", error);
    return { success: false, error };
  }
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const sendTeamInvitationEmail = async (
  to: string,
  name: string,
  inviterName: string,
  role: string,
  setPasswordUrl: string,
): Promise<{ success: boolean; data?: any; error?: any }> => {
  try {
    const htmlContent = EmailTemplate_TEAM_INVITATION(
      name,
      inviterName,
      role,
      setPasswordUrl,
    );
    return await sendEmail(
      to,
      "You're invited to join the team on Fileam",
      htmlContent,
      EMAIL_CATEGORIES.INVITATION,
    );
  } catch (error) {
    console.error("Failed to send team invitation email:", error);
    return { success: false, error };
  }
};

export {
  sendConsultantRequestEmail,
  sendConsultantIncomingClientRequestEmail,
  sendConsultantFilingAuthorizationEmail,
  sendInvitationToJoinEmail,
  sendTeamInvitationEmail,
  sendEmail,
  sendVerificationEmail,
  sendOtpEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  validateEmailConfig,
};
