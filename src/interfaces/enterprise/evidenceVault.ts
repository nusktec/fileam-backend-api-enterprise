export interface EvidenceVaultUploadInput {
  documentName: string;
  category: string;
  documentDate: Date;
  description?: string;
  fileUrl?: string;
  fileSizeKb?: number;
  uploaderId?: string;
}

export interface EvidenceVaultSignInput {
  signedBy: string;
  signerEmail: string;
  ipAddress: string;
  signatureMethod: string;
  documentHash: string;
  signatureData?: string;
}
