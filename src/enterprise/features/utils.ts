import { MONTH_NAMES } from "./constants";

export function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  return Number(value);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function periodBounds(year: number, month: number): {
  start: Date;
  end: Date;
  period: string;
  periodStart: string;
  periodEnd: string;
} {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const lastDay = end.getUTCDate();
  return {
    start,
    end,
    period: `${MONTH_NAMES[month - 1]} ${year}`,
    periodStart: `${year}-${pad2(month)}-01`,
    periodEnd: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

export function formatYmd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function formatHHmm(date: Date): string {
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

export function parsePositiveInt(
  value: unknown,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function healthCategory(
  score: number,
): "healthy" | "stable" | "at-risk" | "failing" {
  if (score >= 80) return "healthy";
  if (score >= 60) return "stable";
  if (score >= 40) return "at-risk";
  return "failing";
}

export function deviceFromUserAgent(ua?: string | null): string {
  if (!ua || !ua.trim()) return "Unknown device";
  const lower = ua.toLowerCase();
  let browser = "Browser";
  if (lower.includes("edg/")) browser = "Edge";
  else if (lower.includes("chrome/")) browser = "Chrome";
  else if (lower.includes("safari/") && !lower.includes("chrome/"))
    browser = "Safari";
  else if (lower.includes("firefox/")) browser = "Firefox";

  let os = "Unknown OS";
  if (lower.includes("mac os") || lower.includes("macintosh")) os = "MacOS";
  else if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("iphone") || lower.includes("ipad")) os = "iOS";
  else if (lower.includes("linux")) os = "Linux";

  return `${browser} on ${os}`;
}

/**
 * No IP geolocation source is configured, so the location is unknown.
 * Returns null rather than a guessed place.
 */
export function locationFromIp(ip?: string | null): string | null {
  void ip;
  return null;
}

export function clientIp(req: {
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string };
  ip?: string;
}): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
}
