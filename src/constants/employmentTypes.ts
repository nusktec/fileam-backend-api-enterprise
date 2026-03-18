export const EMPLOYMENT_TYPES = [
  "Part time",
  "Full time",
  "Contract",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
