export interface FinancialDocumentUploadInput {
  documentType: string;
  description?: string;
  documentDate: Date;
  amount: number;
  currency: string;
  fileUrl?: string;
}
