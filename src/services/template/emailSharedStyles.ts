/** Shared responsive CSS for Fileam HTML emails (OTP, codes, layout). */
export const EMAIL_RESPONSIVE_BASE = `
  * { box-sizing: border-box; }
  html, body { width: 100% !important; margin: 0; padding: 0; -webkit-text-size-adjust: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    background-color: #f5f5f5;
    color: #1a1a1a;
    line-height: 1.6;
    overflow-x: hidden;
  }
  .container {
    max-width: 560px;
    width: 100% !important;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 16px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    overflow: hidden;
  }
  .header, .content, .footer { max-width: 100%; }
  img.logo { max-width: 100%; height: auto; }
  table { border-collapse: collapse; }
`;

/** OTP / verification / invitation code blocks — prevents horizontal overflow on mobile. */
export const EMAIL_CODE_BLOCK_CSS = `
  .otp-container,
  .verification-code,
  .code-container {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 20px 16px;
    text-align: center;
    margin: 24px 0;
    border: 1px solid #e9ecef;
    max-width: 100%;
    overflow: hidden;
  }
  .otp-label,
  .code-label {
    font-size: 12px;
    color: #6c757d;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    word-wrap: break-word;
  }
  .otp-code,
  .code,
  .code-value {
    display: block;
    width: 100%;
    max-width: 100%;
    margin: 0 auto;
    font-size: 32px;
    font-weight: bold;
    color: #1a1a1a;
    letter-spacing: 0.25em;
    font-family: 'Courier New', Courier, monospace;
    background: #fff;
    padding: 16px 12px;
    border-radius: 10px;
    border: 2px solid #008b8b;
    text-align: center;
    word-break: break-all;
    overflow-wrap: anywhere;
    line-height: 1.35;
  }
`;

export const EMAIL_RESPONSIVE_MEDIA = `
  @media only screen and (max-width: 600px) {
    body { padding: 12px !important; }
    .header, .content, .footer { padding: 24px 16px !important; }
    .greeting { font-size: 20px !important; }
    .otp-code, .code, .code-value {
      font-size: 26px !important;
      letter-spacing: 0.15em !important;
      padding: 14px 10px !important;
    }
    .btn, .cta-button { display: block !important; width: 100% !important; max-width: 280px !important; margin: 10px auto !important; }
  }
`;

export function emailStyleBlock(extra = ""): string {
  return `${EMAIL_RESPONSIVE_BASE}${EMAIL_CODE_BLOCK_CSS}${extra}${EMAIL_RESPONSIVE_MEDIA}`;
}
