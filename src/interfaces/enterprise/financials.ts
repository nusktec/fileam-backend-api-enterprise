export interface FinancialDocumentUploadInput {
  documentType: string;
  description?: string;
  documentDate: Date;
  amount: number;
  currency: string;
  fileUrl?: string;
  /** Optional: link this upload to an existing structured invoice (same company). */
  invoiceId?: string;
}
