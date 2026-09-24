export const VAT_WHT_RATE_PERCENT = 7.5;

export const VAT_FORM_NAME = "VAT Return (Form 002)";
export const VAT_FORM_SHORT = "Form 002";
export const WHT_FORM_NAME = "WHT Schedule (Deduction of Tax at Source)";
export const TAX_AUTHORITY = "NRS";
export const TAX_PORTAL_NAME = "NRS Rev360";

export const WORKSPACE_TOTAL_STEPS = 12;

export const WORKSPACE_STEP_TITLES: Record<number, string> = {
  1: "Tax Computation",
  2: "Review & Validation",
  3: "Generate Filing Package",
  4: "Generate Government Forms",
  5: "Review Filing",
  6: "Download & Print",
  7: "Open Tax Authority Portal",
  8: "Complete & Submit",
  9: "Upload Proof of Submission",
  10: "Pay Tax",
  11: "Upload Payment Receipt",
  12: "Mark as Compliant",
};

export const WHT_CLASS_LABELS: Record<string, string> = {
  dividends: "Dividends",
  interest: "Interest",
  rent: "Rent",
  royalties: "Royalties",
  directors_fees: "Directors' fees",
  professional_fees: "Consultancy & professional fees",
  commissions: "Commissions & brokerage",
  construction: "Construction",
  goods_supply: "Contracts / supply of goods",
  compensation: "Compensation for loss of employment",
};

export function toWhtClassId(whtClass: string): string {
  return whtClass.trim().toLowerCase();
}

export function whtClassLabel(classId: string): string {
  return WHT_CLASS_LABELS[classId] ?? classId;
}
