const FILEAM_LOGO = "https://usc1.contabostorage.com/385b0054b385440e928060e34f0e5b18:fileam-assets/fileam-logo.png";
const PRIMARY_COLOR = "#008b8b";
const DOMAIN = "https://fileam.app";

export const EmailTemplate_SEND_OTP = (code: string) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your OTP Code - Fileam</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; color: #1a1a1a; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; }
        .header { background-color: #ffffff; padding: 40px 30px; text-align: center; border-bottom: 1px solid #e9ecef; }
        .logo { display: block; margin: 0 auto 16px; max-height: 48px; width: auto; }
        .header-subtitle { font-size: 16px; color: #6c757d; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 24px; font-weight: 600; color: #1a1a1a; margin-bottom: 20px; text-align: center; }
        .message { font-size: 16px; color: #4a4a4a; margin-bottom: 30px; text-align: center; line-height: 1.7; }
        .otp-container { background: #f8f9fa; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; border: 2px solid ${PRIMARY_COLOR}; }
        .otp-label { font-size: 14px; color: #6c757d; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        .otp-code { font-size: 48px; font-weight: bold; color: #1a1a1a; letter-spacing: 8px; font-family: 'Courier New', monospace; background: white; padding: 20px 30px; border-radius: 8px; display: inline-block; min-width: 280px; }
        .expiry-info { background-color: #fff8e6; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; }
        .expiry-text { color: #92400e; font-size: 14px; font-weight: 500; }
        .security-note { background-color: #e6f7f7; border-left: 4px solid ${PRIMARY_COLOR}; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .security-text { color: #004d4d; font-size: 14px; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef; }
        .footer-text { color: #6c757d; font-size: 14px; margin-bottom: 15px; }
        .social-link { display: inline-block; margin: 0 10px; color: ${PRIMARY_COLOR}; text-decoration: none; font-size: 14px; }
        @media (max-width: 600px) { .container { margin: 10px; } .header, .content, .footer { padding: 20px; } .otp-code { font-size: 36px; letter-spacing: 6px; min-width: 240px; } .greeting { font-size: 20px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${FILEAM_LOGO}" alt="Fileam" class="logo" width="140" height="48">
            <div class="header-subtitle">Secure Access Code</div>
        </div>
        <div class="content">
            <div class="greeting">Hello!</div>
            <div class="message">You've requested a one-time password (OTP) for your Fileam account. Use the secure code below to complete your action.</div>
            <div class="otp-container">
                <div class="otp-label">Your Secure Access Code</div>
                <div class="otp-code">${code}</div>
            </div>
            <div class="expiry-info"><div class="expiry-text">This code expires in 10 minutes</div></div>
            <div class="security-note">
                <div class="security-text">For your security, please do not share this access code with anyone. Fileam will never ask for this code via phone, email, or text message.</div>
            </div>
            <div class="message">If you didn't request this access code, please ignore this email and consider changing your password immediately.</div>
        </div>
        <div class="footer">
            <div class="footer-text">© Fileam. All rights reserved.</div>
            <div class="footer-text">This email was sent for account security purposes.</div>
            <a href="${DOMAIN}/privacy" class="social-link">Privacy Policy</a>
            <a href="${DOMAIN}/terms" class="social-link">Terms of Service</a>
            <a href="${DOMAIN}/support" class="social-link">Contact Support</a>
        </div>
    </div>
</body>
</html>
  `;
};

export const EmailTemplate_ACCOUNT_VERIFICATION = (code: string, name: string) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Verification - Fileam</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; color: #1a1a1a; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; }
        .header { background-color: #ffffff; padding: 40px 30px; text-align: center; border-bottom: 1px solid #e9ecef; }
        .logo { display: block; margin: 0 auto 16px; max-height: 48px; width: auto; }
        .header-subtitle { font-size: 16px; color: #6c757d; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 24px; font-weight: 600; color: #1a1a1a; margin-bottom: 20px; text-align: center; }
        .message { font-size: 16px; color: #4a4a4a; margin-bottom: 30px; text-align: center; line-height: 1.7; }
        .otp-container { background: #f8f9fa; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; border: 2px solid ${PRIMARY_COLOR}; }
        .otp-label { font-size: 14px; color: #6c757d; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        .otp-code { font-size: 48px; font-weight: bold; color: #1a1a1a; letter-spacing: 8px; font-family: 'Courier New', monospace; background: white; padding: 20px 30px; border-radius: 8px; display: inline-block; min-width: 280px; }
        .expiry-info { background-color: #fff8e6; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; }
        .expiry-text { color: #92400e; font-size: 14px; font-weight: 500; }
        .security-note { background-color: #e6f7f7; border-left: 4px solid ${PRIMARY_COLOR}; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .security-text { color: #004d4d; font-size: 14px; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef; }
        .footer-text { color: #6c757d; font-size: 14px; margin-bottom: 15px; }
        .social-link { display: inline-block; margin: 0 10px; color: ${PRIMARY_COLOR}; text-decoration: none; font-size: 14px; }
        @media (max-width: 600px) { .container { margin: 10px; } .header, .content, .footer { padding: 20px; } .otp-code { font-size: 36px; letter-spacing: 6px; min-width: 240px; } .greeting { font-size: 20px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${FILEAM_LOGO}" alt="Fileam" class="logo" width="140" height="48">
            <div class="header-subtitle">Verify Your Email Address</div>
        </div>
        <div class="content">
            <div class="greeting">Hello ${name}!</div>
            <div class="message">Thank you for joining Fileam! To complete your registration, please verify your email address using the verification code below.</div>
            <div class="otp-container">
                <div class="otp-label">Your Verification Code</div>
                <div class="otp-code">${code}</div>
            </div>
            <div class="expiry-info"><div class="expiry-text">This code expires in 10 minutes</div></div>
            <div class="security-note">
                <div class="security-text">For your security, please do not share this verification code with anyone. Fileam will never ask for this code via phone, email, or text message.</div>
            </div>
            <div class="message">If you didn't create an account with Fileam, you can safely ignore this email. If you have any questions, please contact our support team.</div>
        </div>
        <div class="footer">
            <div class="footer-text">© Fileam. All rights reserved.</div>
            <div class="footer-text">This email was sent because you signed up for Fileam.</div>
            <a href="${DOMAIN}/privacy" class="social-link">Privacy Policy</a>
            <a href="${DOMAIN}/terms" class="social-link">Terms of Service</a>
            <a href="${DOMAIN}/support" class="social-link">Contact Support</a>
        </div>
    </div>
</body>
</html>
  `;
};

export const EmailTemplate_WELCOME = (name: string) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Fileam!</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; color: #1a1a1a; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; }
        .header { background-color: #ffffff; padding: 40px 30px; text-align: center; border-bottom: 1px solid #e9ecef; }
        .logo { display: block; margin: 0 auto 16px; max-height: 48px; width: auto; }
        .header-subtitle { font-size: 16px; color: #6c757d; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 28px; font-weight: 600; color: #1a1a1a; margin-bottom: 20px; text-align: center; }
        .message { font-size: 16px; color: #4a4a4a; margin-bottom: 30px; text-align: center; line-height: 1.7; }
        .success-container { background-color: #e6f7f7; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; border: 2px solid ${PRIMARY_COLOR}; }
        .success-icon { font-size: 48px; margin-bottom: 15px; }
        .success-text { color: #004d4d; font-size: 18px; font-weight: 600; }
        .features { background-color: #f8fafc; border-radius: 12px; padding: 30px; margin: 30px 0; }
        .features-title { font-size: 20px; font-weight: 600; color: #1a1a1a; margin-bottom: 20px; text-align: center; }
        .feature-item { display: flex; align-items: center; margin: 15px 0; padding: 10px; background: white; border-radius: 8px; border-left: 4px solid ${PRIMARY_COLOR}; }
        .feature-icon { font-size: 20px; color: ${PRIMARY_COLOR}; margin-right: 15px; font-weight: bold; }
        .feature-text { color: #4a4a4a; font-size: 16px; }
        .cta-section { text-align: center; margin: 30px 0; }
        .cta-button { display: inline-block; background-color: ${PRIMARY_COLOR}; color: white !important; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef; }
        .footer-text { color: #6c757d; font-size: 14px; margin-bottom: 15px; }
        .social-link { display: inline-block; margin: 0 10px; color: ${PRIMARY_COLOR}; text-decoration: none; font-size: 14px; }
        @media (max-width: 600px) { .container { margin: 10px; } .header, .content, .footer { padding: 20px; } .greeting { font-size: 24px; } .cta-button { display: block; margin: 10px auto; max-width: 200px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${FILEAM_LOGO}" alt="Fileam" class="logo" width="140" height="48">
            <div class="header-subtitle">Welcome to Fileam</div>
        </div>
        <div class="content">
            <div class="greeting">Welcome, ${name}!</div>
            <div class="message">Congratulations! Your account has been successfully verified and is now fully activated. We're excited to have you join Fileam!</div>
            <div class="success-container">
                <div class="success-icon">✓</div>
                <div class="success-text">Account Successfully Verified!</div>
            </div>
            <div class="features">
                <div class="features-title">What you can do now:</div>
                <div class="feature-item"><div class="feature-icon">→</div><div class="feature-text">Access your personalized dashboard</div></div>
                <div class="feature-item"><div class="feature-icon">→</div><div class="feature-text">Manage your profile and preferences</div></div>
                <div class="feature-item"><div class="feature-icon">→</div><div class="feature-text">Explore our services and features</div></div>
                <div class="feature-item"><div class="feature-icon">→</div><div class="feature-text">Connect with our support team</div></div>
            </div>
            <div class="cta-section"><a href="${DOMAIN}" class="cta-button">Get Started Now</a></div>
            <div class="message">If you have any questions or need assistance, don't hesitate to reach out to our support team. We're here to help you make the most of your Fileam experience!</div>
        </div>
        <div class="footer">
            <div class="footer-text">© Fileam. All rights reserved.</div>
            <div class="footer-text">Thank you for choosing Fileam!</div>
            <a href="${DOMAIN}/privacy" class="social-link">Privacy Policy</a>
            <a href="${DOMAIN}/terms" class="social-link">Terms of Service</a>
            <a href="${DOMAIN}/support" class="social-link">Contact Support</a>
        </div>
    </div>
</body>
</html>
  `;
};

export const EmailTemplate_PASSWORD_RESET = (code: string, name: string) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset - Fileam</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; color: #1a1a1a; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; }
        .header { background-color: #ffffff; padding: 40px 30px; text-align: center; border-bottom: 1px solid #e9ecef; }
        .logo { display: block; margin: 0 auto 16px; max-height: 48px; width: auto; }
        .header-subtitle { font-size: 16px; color: #6c757d; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 24px; font-weight: 600; color: #1a1a1a; margin-bottom: 20px; text-align: center; }
        .message { font-size: 16px; color: #4a4a4a; margin-bottom: 30px; text-align: center; line-height: 1.7; }
        .otp-container { background: #f8f9fa; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; border: 2px solid ${PRIMARY_COLOR}; }
        .otp-label { font-size: 14px; color: #6c757d; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        .otp-code { font-size: 48px; font-weight: bold; color: #1a1a1a; letter-spacing: 8px; font-family: 'Courier New', monospace; background: white; padding: 20px 30px; border-radius: 8px; display: inline-block; min-width: 280px; }
        .expiry-info { background-color: #fff8e6; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; }
        .expiry-text { color: #92400e; font-size: 14px; font-weight: 500; }
        .security-note { background-color: #e6f7f7; border-left: 4px solid ${PRIMARY_COLOR}; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .security-text { color: #004d4d; font-size: 14px; }
        .action-buttons { text-align: center; margin: 30px 0; }
        .btn { display: inline-block; background-color: ${PRIMARY_COLOR}; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 0 10px; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef; }
        .footer-text { color: #6c757d; font-size: 14px; margin-bottom: 15px; }
        .social-link { display: inline-block; margin: 0 10px; color: ${PRIMARY_COLOR}; text-decoration: none; font-size: 14px; }
        @media (max-width: 600px) { .container { margin: 10px; } .header, .content, .footer { padding: 20px; } .otp-code { font-size: 36px; letter-spacing: 6px; min-width: 240px; } .greeting { font-size: 20px; } .btn { display: block; margin: 10px auto; max-width: 200px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${FILEAM_LOGO}" alt="Fileam" class="logo" width="140" height="48">
            <div class="header-subtitle">Password Reset Request</div>
        </div>
        <div class="content">
            <div class="greeting">Hello ${name}!</div>
            <div class="message">We received a request to reset your password for your Fileam account. Use the secure code below to proceed with the password reset process.</div>
            <div class="otp-container">
                <div class="otp-label">Your Password Reset Code</div>
                <div class="otp-code">${code}</div>
            </div>
            <div class="expiry-info"><div class="expiry-text">This code expires in 10 minutes</div></div>
            <div class="security-note">
                <div class="security-text">For your security, please do not share this reset code with anyone. Fileam will never ask for this code via phone, email, or text message.</div>
            </div>
            <div class="message">If you didn't request a password reset, please ignore this email and consider changing your password immediately for security.</div>
            <div class="action-buttons">
                <a href="${DOMAIN}/reset-password" class="btn">Reset Password</a>
                <a href="${DOMAIN}/support" class="btn">Contact Support</a>
            </div>
        </div>
        <div class="footer">
            <div class="footer-text">© Fileam. All rights reserved.</div>
            <div class="footer-text">This email was sent for account security purposes.</div>
            <a href="${DOMAIN}/privacy" class="social-link">Privacy Policy</a>
            <a href="${DOMAIN}/terms" class="social-link">Terms of Service</a>
            <a href="${DOMAIN}/support" class="social-link">Contact Support</a>
        </div>
    </div>
</body>
</html>
  `;
};

export const EmailTemplate_TEAM_INVITATION = (
  name: string,
  inviterName: string,
  role: string,
  setPasswordUrl: string,
) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Team Invitation - Fileam</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; color: #1a1a1a; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; }
        .header { background-color: #ffffff; padding: 40px 30px; text-align: center; border-bottom: 1px solid #e9ecef; }
        .logo { display: block; margin: 0 auto 16px; max-height: 48px; width: auto; }
        .header-subtitle { font-size: 16px; color: #6c757d; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 24px; font-weight: 600; color: #1a1a1a; margin-bottom: 20px; text-align: center; }
        .message { font-size: 16px; color: #4a4a4a; margin-bottom: 30px; text-align: center; line-height: 1.7; }
        .invite-details { background: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0; border-left: 4px solid ${PRIMARY_COLOR}; }
        .invite-row { margin: 8px 0; font-size: 15px; }
        .invite-label { color: #6c757d; font-weight: 600; }
        .cta-section { text-align: center; margin: 30px 0; }
        .cta-button { display: inline-block; background-color: ${PRIMARY_COLOR}; color: white !important; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
        .expiry-info { background-color: #fff8e6; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; }
        .expiry-text { color: #92400e; font-size: 14px; font-weight: 500; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef; }
        .footer-text { color: #6c757d; font-size: 14px; margin-bottom: 15px; }
        .social-link { display: inline-block; margin: 0 10px; color: ${PRIMARY_COLOR}; text-decoration: none; font-size: 14px; }
        @media (max-width: 600px) { .container { margin: 10px; } .header, .content, .footer { padding: 20px; } .greeting { font-size: 20px; } .cta-button { display: block; margin: 10px auto; max-width: 200px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${FILEAM_LOGO}" alt="Fileam" class="logo" width="140" height="48">
            <div class="header-subtitle">Team Invitation</div>
        </div>
        <div class="content">
            <div class="greeting">Hello ${name}!</div>
            <div class="message">${inviterName} has invited you to join their team on Fileam as a <strong>${role}</strong>. Click the button below to set your password and activate your account.</div>
            <div class="invite-details">
                <div class="invite-row"><span class="invite-label">Invited by:</span> ${inviterName}</div>
                <div class="invite-row"><span class="invite-label">Your role:</span> ${role}</div>
            </div>
            <div class="expiry-info"><div class="expiry-text">This invitation expires in 7 days</div></div>
            <div class="cta-section">
                <a href="${setPasswordUrl}" class="cta-button">Set Password & Join Team</a>
            </div>
            <div class="message">If you didn't expect this invitation, you can safely ignore this email.</div>
        </div>
        <div class="footer">
            <div class="footer-text">© Fileam. All rights reserved.</div>
            <a href="${DOMAIN}/privacy" class="social-link">Privacy Policy</a>
            <a href="${DOMAIN}/terms" class="social-link">Terms of Service</a>
            <a href="${DOMAIN}/support" class="social-link">Contact Support</a>
        </div>
    </div>
</body>
</html>
  `;
};

