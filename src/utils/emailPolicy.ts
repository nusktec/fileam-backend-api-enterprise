/** Blocks subaddress / plus-alias emails (e.g. user+5@domain.com) at signup. */
export const PLUS_ALIAS_EMAIL_MESSAGE =
  "Email addresses with a '+' alias (e.g. name+tag@domain.com) are not allowed. Use your primary email address.";

/**
 * Returns true when the local part (before @) contains '+' (RFC 5322 subaddressing).
 */
export function hasEmailPlusAlias(email: string): boolean {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return false;
  return trimmed.slice(0, at).includes("+");
}

/** Use in services after trimming; returns error message or null if allowed. */
export function signupEmailRejectionMessage(email: string): string | null {
  return hasEmailPlusAlias(email) ? PLUS_ALIAS_EMAIL_MESSAGE : null;
}
