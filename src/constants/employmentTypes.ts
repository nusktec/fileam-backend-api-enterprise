export const EMPLOYMENT_TYPES = [
  "Part time",
  "Full time",
  "Contract",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** Contractors are subject to WHT, not PAYE (payroll withholding). */
export function isContractorEmployment(employmentType: string): boolean {
  return employmentType.trim() === "Contract";
}
