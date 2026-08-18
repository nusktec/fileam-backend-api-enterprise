export const PREPAYMENT_STATUSES = [
  "ACTIVE",
  "FULLY_RECOGNIZED",
  "CANCELLED",
] as const;
export type PrepaymentStatus = (typeof PREPAYMENT_STATUSES)[number];

export const PREPAYMENT_SCHEDULE_STATUSES = [
  "SCHEDULED",
  "RECOGNIZED",
  "CANCELLED",
] as const;
export type PrepaymentScheduleStatus =
  (typeof PREPAYMENT_SCHEDULE_STATUSES)[number];

export const PREPAYMENT_RECOGNITION_FREQUENCIES = [
  "MONTHLY",
  "QUARTERLY",
  "ANNUALLY",
  "CUSTOM",
] as const;
export type PrepaymentRecognitionFrequency =
  (typeof PREPAYMENT_RECOGNITION_FREQUENCIES)[number];

export function isValidPrepaymentFrequency(value: string): boolean {
  return (PREPAYMENT_RECOGNITION_FREQUENCIES as readonly string[]).includes(
    value,
  );
}
