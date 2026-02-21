export interface Step1Body {
  businessStructure: string;
  firmName: string;
  registrationType: string;
  rcNumber?: string;
  yearOfIncorporation?: number;
  countryOfRegistration: string;
}

export interface CertificationInput {
  qualificationName: string;
  issuingBody: string;
  year?: number;
  national?: string;
}

export interface Step2Body {
  numberOfPartners: number;
  principalPartner: {
    fullName: string;
    email: string;
    phone: string;
    yearsOfExperience?: number;
    certifications: CertificationInput[];
  };
}

export interface AdditionalPartnerInput {
  partnerName: string;
  role: string;
  yearsOfExperience?: number;
  certifications: Array<{
    qualification: string;
    issuingBody: string;
    national?: string;
    year?: number;
  }>;
}

export interface Step3Body {
  additionalPartners: AdditionalPartnerInput[];
}

export interface Step4Body {
  primaryState: string;
  additionalStates: string[];
  taxTypesSpecializations: string[];
  businessSizeServed: string;
}

export interface ReminderConfigItem {
  filing: string;
  frequency: string;
  reminderDates: number[];
}

export interface Step5Body {
  billingOption: string;
  enableAutomatedComplianceReminders: boolean;
  perFilingReminderConfig?: ReminderConfigItem[];
}

export interface Step6Body {
  paymentMethod: string;
  bankAccountNumber?: string;
  warrantApproval?: string;
  selfRemittance?: string;
}

export interface Step7Body {
  cacDocumentUrl?: string;
  principalPartnerIdUrl?: string;
  professionalCertificateUrl?: string;
  amlDocumentUrl?: string;
  firmProfileUrl?: string;
  declarationAccuracy: boolean;
  declarationFirsCompliance: boolean;
  declarationSuspensionPolicy: boolean;
  saveAsDraft?: boolean;
}
