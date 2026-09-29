/** Display numbers like Sale 002 / Expense 003 from stored codes. */
export function displayRecordNumber(raw: string | null | undefined): string {
  if (raw == null) return "";
  const stripped = String(raw)
    .replace(/^(EXP-|SALE-|INV-|AST-|LIAB-|PAY-|BEN-)/i, "")
    .trim();
  if (/^\d+$/.test(stripped)) return stripped.padStart(3, "0");
  return stripped || String(raw).trim();
}

export function saleRecognitionDescription(invoiceNumber: string): string {
  return `Sale recognition — Sale ${displayRecordNumber(invoiceNumber)}`;
}

export function saleCollectionDescription(invoiceNumber: string): string {
  return `Sale collection — Sale ${displayRecordNumber(invoiceNumber)}`;
}

export function expenseRecognitionDescription(expenseNumber: string): string {
  return `Expense recognition — Expense ${displayRecordNumber(expenseNumber)}`;
}

export function expensePaymentDescription(expenseNumber: string): string {
  return `Expense payment — Expense ${displayRecordNumber(expenseNumber)}`;
}

export function reversalForDescription(
  kind: string,
  recordNumber: string,
): string {
  return `Reversal for ${kind} ${displayRecordNumber(recordNumber)}`;
}
