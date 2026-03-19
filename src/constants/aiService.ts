/**
 * AI Service API - server-to-server authentication.
 * Used by external AI services to pull and update client records.
 */
export const AI_SERVICE_SECRET =
  process.env.AI_SERVICE_SECRET || "fileam-ai-service-secret-change-in-production";

export const AI_HEADERS = {
  CLIENT_ID: "x-client-id",
  API_SECRET: "x-api-secret",
} as const;
