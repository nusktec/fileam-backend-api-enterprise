export const EmailTemplate_SEND_OTP = (code: string) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your OTP Code - Slant Menu</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            line-height: 1.6;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        
        .logo {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 10px;
            letter-spacing: 1px;
        }
        
        .header-subtitle {
            font-size: 16px;
            opacity: 0.9;
            font-weight: 300;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            font-size: 24px;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .message {
            font-size: 16px;
            color: #475569;
            margin-bottom: 30px;
            text-align: center;
            line-height: 1.7;
        }
        
        .otp-container {
            background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
            border: 2px solid #a7f3d0;
        }
        
        .otp-label {
            font-size: 14px;
            color: #065f46;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }
        
        .otp-code {
            font-size: 48px;
            font-weight: bold;
            color: #064e3b;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
            background: white;
            padding: 20px 30px;
            border-radius: 8px;
            border: 2px solid #6ee7b7;
            display: inline-block;
            min-width: 280px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .expiry-info {
            background-color: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
        }
        
        .expiry-text {
            color: #92400e;
            font-size: 14px;
            font-weight: 500;
        }
        
        .security-note {
            background-color: #f1f5f9;
            border-left: 4px solid #10b981;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .security-text {
            color: #475569;
            font-size: 14px;
            font-style: italic;
        }
        
        .footer {
            background-color: #f8fafc;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
        }
        
        .footer-text {
            color: #64748b;
            font-size: 14px;
            margin-bottom: 15px;
        }
        
        .social-links {
            margin-top: 20px;
        }
        
        .social-link {
            display: inline-block;
            margin: 0 10px;
            color: #64748b;
            text-decoration: none;
            font-size: 14px;
        }
        
        .social-link:hover {
            color: #10b981;
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
                border-radius: 8px;
            }
            
            .header, .content, .footer {
                padding: 20px;
            }
            
            .otp-code {
                font-size: 36px;
                letter-spacing: 6px;
                min-width: 240px;
                padding: 15px 20px;
            }
            
            .greeting {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="logo">🍽️ Slant Menu</div>
            <div class="header-subtitle">Secure Access Code</div>
        </div>
        
        <!-- Content -->
        <div class="content">
            <div class="greeting">Hello! 🔐</div>
            
            <div class="message">
                You've requested a one-time password (OTP) for your Slant Menu account. 
                Use the secure code below to complete your action.
            </div>
            
            <!-- OTP Container -->
            <div class="otp-container">
                <div class="otp-label">Your Secure Access Code</div>
                <div class="otp-code">${code}</div>
            </div>
            
            <!-- Expiry Info -->
            <div class="expiry-info">
                <div class="expiry-text">⏰ This code expires in 10 minutes</div>
            </div>
            
            <!-- Security Note -->
            <div class="security-note">
                <div class="security-text">
                    🔒 For your security, please do not share this access code with anyone. 
                    Our team will never ask for this code via phone, email, or text message.
                </div>
            </div>
            
            <div class="message">
                If you didn't request this access code, please ignore this email and consider changing your password immediately.
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="footer-text">
                © 2024 Slant Menu. All rights reserved.
            </div>
            <div class="footer-text">
                This email was sent for account security purposes.
            </div>
            <div class="social-links">
                <a href="#" class="social-link">Privacy Policy</a>
                <a href="#" class="social-link">Terms of Service</a>
                <a href="#" class="social-link">Security Center</a>
            </div>
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
    <title>Email Verification - Slant Menu</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            line-height: 1.6;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        
        .logo {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 10px;
            letter-spacing: 1px;
        }
        
        .header-subtitle {
            font-size: 16px;
            opacity: 0.9;
            font-weight: 300;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            font-size: 24px;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .message {
            font-size: 16px;
            color: #475569;
            margin-bottom: 30px;
            text-align: center;
            line-height: 1.7;
        }
        
        .otp-container {
            background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
            border: 2px solid #e2e8f0;
        }
        
        .otp-label {
            font-size: 14px;
            color: #64748b;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }
        
        .otp-code {
            font-size: 48px;
            font-weight: bold;
            color: #1e293b;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
            background: white;
            padding: 20px 30px;
            border-radius: 8px;
            border: 2px solid #cbd5e1;
            display: inline-block;
            min-width: 280px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .expiry-info {
            background-color: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
        }
        
        .expiry-text {
            color: #92400e;
            font-size: 14px;
            font-weight: 500;
        }
        
        .security-note {
            background-color: #f1f5f9;
            border-left: 4px solid #3b82f6;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .security-text {
            color: #475569;
            font-size: 14px;
            font-style: italic;
        }
        
        .footer {
            background-color: #f8fafc;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
        }
        
        .footer-text {
            color: #64748b;
            font-size: 14px;
            margin-bottom: 15px;
        }
        
        .social-links {
            margin-top: 20px;
        }
        
        .social-link {
            display: inline-block;
            margin: 0 10px;
            color: #64748b;
            text-decoration: none;
            font-size: 14px;
        }
        
        .social-link:hover {
            color: #3b82f6;
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
                border-radius: 8px;
            }
            
            .header, .content, .footer {
                padding: 20px;
            }
            
            .otp-code {
                font-size: 36px;
                letter-spacing: 6px;
                min-width: 240px;
                padding: 15px 20px;
            }
            
            .greeting {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="logo">🍽️ Slant Menu</div>
            <div class="header-subtitle">Your Culinary Journey Starts Here</div>
        </div>
        
        <!-- Content -->
        <div class="content">
            <div class="greeting">Hello ${name}! 👋</div>
            
            <div class="message">
                Thank you for joining Slant Menu! To complete your registration and start exploring amazing dishes, please verify your email address using the verification code below.
            </div>
            
            <!-- OTP Container -->
            <div class="otp-container">
                <div class="otp-label">Your Verification Code</div>
                <div class="otp-code">${code}</div>
            </div>
            
            <!-- Expiry Info -->
            <div class="expiry-info">
                <div class="expiry-text">⏰ This code expires in 10 minutes</div>
            </div>
            
            <!-- Security Note -->
            <div class="security-note">
                <div class="security-text">
                    🔒 For your security, please do not share this verification code with anyone. 
                    Our team will never ask for this code via phone, email, or text message.
                </div>
            </div>
            
            <div class="message">
                If you didn't create an account with Slant Menu, you can safely ignore this email.
                If you have any questions, please contact our support team.
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="footer-text">
                © 2024 Slant Menu. All rights reserved.
            </div>
            <div class="footer-text">
                This email was sent because you signed up for Slant Menu.
            </div>
            <div class="social-links">
                <a href="#" class="social-link">Privacy Policy</a>
                <a href="#" class="social-link">Terms of Service</a>
                <a href="#" class="social-link">Contact Support</a>
            </div>
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
    <title>Welcome to Slant Menu!</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            line-height: 1.6;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        
        .logo {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 10px;
            letter-spacing: 1px;
        }
        
        .header-subtitle {
            font-size: 16px;
            opacity: 0.9;
            font-weight: 300;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            font-size: 28px;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .message {
            font-size: 16px;
            color: #475569;
            margin-bottom: 30px;
            text-align: center;
            line-height: 1.7;
        }
        
        .success-container {
            background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
            border: 2px solid #a7f3d0;
        }
        
        .success-icon {
            font-size: 48px;
            margin-bottom: 15px;
        }
        
        .success-text {
            color: #065f46;
            font-size: 18px;
            font-weight: 600;
        }
        
        .features {
            background-color: #f8fafc;
            border-radius: 12px;
            padding: 30px;
            margin: 30px 0;
        }
        
        .features-title {
            font-size: 20px;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .feature-item {
            display: flex;
            align-items: center;
            margin: 15px 0;
            padding: 10px;
            background: white;
            border-radius: 8px;
            border-left: 4px solid #8b5cf6;
        }
        
        .feature-icon {
            font-size: 20px;
            color: #8b5cf6;
            margin-right: 15px;
            font-weight: bold;
        }
        
        .feature-text {
            color: #475569;
            font-size: 16px;
        }
        
        .cta-section {
            text-align: center;
            margin: 30px 0;
        }
        
        .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%);
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(139, 92, 246, 0.3);
        }
        
        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(139, 92, 246, 0.4);
        }
        
        .footer {
            background-color: #f8fafc;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
        }
        
        .footer-text {
            color: #64748b;
            font-size: 14px;
            margin-bottom: 15px;
        }
        
        .social-links {
            margin-top: 20px;
        }
        
        .social-link {
            display: inline-block;
            margin: 0 10px;
            color: #64748b;
            text-decoration: none;
            font-size: 14px;
        }
        
        .social-link:hover {
            color: #8b5cf6;
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
                border-radius: 8px;
            }
            
            .header, .content, .footer {
                padding: 20px;
            }
            
            .greeting {
                font-size: 24px;
            }
            
            .cta-button {
                display: block;
                margin: 10px auto;
                max-width: 200px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="logo">🍽️ Slant Menu</div>
            <div class="header-subtitle">Welcome to Your Culinary Journey</div>
        </div>
        
        <!-- Content -->
        <div class="content">
            <div class="greeting">🎉 Welcome, ${name}! 🎉</div>
            
            <div class="message">
                Congratulations! Your account has been successfully verified and is now fully activated. 
                We're excited to have you join the Slant Menu family!
            </div>
            
            <!-- Success Container -->
            <div class="success-container">
                <div class="success-icon">✅</div>
                <div class="success-text">Account Successfully Verified!</div>
            </div>
            
            <!-- Features -->
            <div class="features">
                <div class="features-title">What you can do now:</div>
                
                <div class="feature-item">
                    <div class="feature-icon">🚀</div>
                    <div class="feature-text">Access your personalized dashboard</div>
                </div>
                
                <div class="feature-item">
                    <div class="feature-icon">👤</div>
                    <div class="feature-text">Manage your profile and preferences</div>
                </div>
                
                <div class="feature-item">
                    <div class="feature-icon">🍽️</div>
                    <div class="feature-text">Explore our services and features</div>
                </div>
                
                <div class="feature-item">
                    <div class="feature-icon">💬</div>
                    <div class="feature-text">Connect with our support team</div>
                </div>
            </div>
            
            <!-- CTA Section -->
            <div class="cta-section">
                <a href="#" class="cta-button">Get Started Now</a>
            </div>
            
            <div class="message">
                If you have any questions or need assistance, don't hesitate to reach out to our support team. 
                We're here to help you make the most of your Slant Menu experience!
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="footer-text">
                © 2024 Slant Menu. All rights reserved.
            </div>
            <div class="footer-text">
                Thank you for choosing Slant Menu!
            </div>
            <div class="social-links">
                <a href="#" class="social-link">Privacy Policy</a>
                <a href="#" class="social-link">Terms of Service</a>
                <a href="#" class="social-link">Contact Support</a>
            </div>
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
    <title>Password Reset - Slant Menu</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            line-height: 1.6;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
        }
        
        .logo {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 10px;
            letter-spacing: 1px;
        }
        
        .header-subtitle {
            font-size: 16px;
            opacity: 0.9;
            font-weight: 300;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .greeting {
            font-size: 24px;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .message {
            font-size: 16px;
            color: #475569;
            margin-bottom: 30px;
            text-align: center;
            line-height: 1.7;
        }
        
        .otp-container {
            background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
            border: 2px solid #fecaca;
        }
        
        .otp-label {
            font-size: 14px;
            color: #991b1b;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }
        
        .otp-code {
            font-size: 48px;
            font-weight: bold;
            color: #7f1d1d;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
            background: white;
            padding: 20px 30px;
            border-radius: 8px;
            border: 2px solid #fca5a5;
            display: inline-block;
            min-width: 280px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .expiry-info {
            background-color: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
        }
        
        .expiry-text {
            color: #92400e;
            font-size: 14px;
            font-weight: 500;
        }
        
        .security-note {
            background-color: #f1f5f9;
            border-left: 4px solid #ef4444;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .security-text {
            color: #475569;
            font-size: 14px;
            font-style: italic;
        }
        
        .action-buttons {
            text-align: center;
            margin: 30px 0;
        }
        
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            margin: 0 10px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(239, 68, 68, 0.4);
        }
        
        .footer {
            background-color: #f8fafc;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
        }
        
        .footer-text {
            color: #64748b;
            font-size: 14px;
            margin-bottom: 15px;
        }
        
        .social-links {
            margin-top: 20px;
        }
        
        .social-link {
            display: inline-block;
            margin: 0 10px;
            color: #64748b;
            text-decoration: none;
            font-size: 14px;
        }
        
        .social-link:hover {
            color: #ef4444;
        }
        
        @media (max-width: 600px) {
            .container {
                margin: 10px;
                border-radius: 8px;
            }
            
            .header, .content, .footer {
                padding: 20px;
            }
            
            .otp-code {
                font-size: 36px;
                letter-spacing: 6px;
                min-width: 240px;
                padding: 15px 20px;
            }
            
            .greeting {
                font-size: 20px;
            }
            
            .btn {
                display: block;
                margin: 10px auto;
                max-width: 200px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="logo">🍽️ Slant Menu</div>
            <div class="header-subtitle">Password Reset Request</div>
        </div>
        
        <!-- Content -->
        <div class="content">
            <div class="greeting">Hello ${name}! 🔐</div>
            
            <div class="message">
                We received a request to reset your password for your Slant Menu account. 
                Use the secure code below to proceed with the password reset process.
            </div>
            
            <!-- OTP Container -->
            <div class="otp-container">
                <div class="otp-label">Your Password Reset Code</div>
                <div class="otp-code">${code}</div>
            </div>
            
            <!-- Expiry Info -->
            <div class="expiry-info">
                <div class="expiry-text">⏰ This code expires in 10 minutes</div>
            </div>
            
            <!-- Security Note -->
            <div class="security-note">
                <div class="security-text">
                    🔒 For your security, please do not share this reset code with anyone. 
                    Our team will never ask for this code via phone, email, or text message.
                </div>
            </div>
            
            <div class="message">
                If you didn't request a password reset, please ignore this email and consider changing your password immediately for security.
            </div>
            
            <!-- Action Buttons -->
            <div class="action-buttons">
                <a href="#" class="btn">Reset Password</a>
                <a href="#" class="btn">Contact Support</a>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="footer-text">
                © 2024 Slant Menu. All rights reserved.
            </div>
            <div class="footer-text">
                This email was sent for account security purposes.
            </div>
            <div class="social-links">
                <a href="#" class="social-link">Privacy Policy</a>
                <a href="#" class="social-link">Terms of Service</a>
                <a href="#" class="social-link">Security Center</a>
            </div>
        </div>
    </div>
</body>
</html>
  `;
};

