import { check, param } from "express-validator";
import { handleValidation } from "../errorHandler";

// ---- Company & Invitation (top-level protected routes) ----
const validateCreateCompany = [
  check("name")
    .trim()
    .notEmpty()
    .withMessage("Company name is required")
    .isString()
    .withMessage("name must be a string"),
  handleValidation,
];

const validateCreateInvitation = [
  check("invitedEmail")
    .trim()
    .notEmpty()
    .withMessage("invitedEmail is required")
    .bail()
    .isEmail()
    .withMessage("invitedEmail must be a valid email"),
  check("companyId")
    .optional()
    .trim()
    .isUUID()
    .withMessage("companyId must be a valid UUID"),
  check("invitedBusinessName").optional().trim().isString(),
  check("expiresInHours").optional().isInt({ min: 1, max: 720 }).withMessage("expiresInHours must be between 1 and 720"),
  check("invitedContactName").optional().trim().isString(),
  check("invitedRcNumber").optional().trim().isString(),
  check("invitedPhone").optional().trim().isString(),
  check("stateOfOperation").optional().trim().isString(),
  check("taxTypesManaged")
    .optional()
    .custom((v) => {
      if (Array.isArray(v)) return v.every((s) => typeof s === "string");
      if (typeof v === "string") return true;
      return false;
    })
    .withMessage("taxTypesManaged must be an array of strings (e.g. VAT, PAYE, CIT, WHT) or a string"),
  handleValidation,
];

// ---- Params (for routes under /clients/:clientId and with :documentId / :invoiceId) ----
const validateCompanyIdParam = [
  param("companyId").isUUID().withMessage("Company ID must be a valid UUID"),
  handleValidation,
];

const validateClientIdParam = [
  param("clientId").isUUID().withMessage("Client ID must be a valid UUID"),
  handleValidation,
];

const validateFilingIdParam = [
  param("filingId").isUUID().withMessage("Filing ID must be a valid UUID"),
  handleValidation,
];

const validateDocumentIdParam = [
  param("documentId").isUUID().withMessage("Document ID must be a valid UUID"),
  handleValidation,
];

const validateInvoiceIdParam = [
  param("invoiceId").isUUID().withMessage("Invoice ID must be a valid UUID"),
  handleValidation,
];

const validateInvitationIdParam = [
  param("id").isUUID().withMessage("Invitation ID must be a valid UUID"),
  handleValidation,
];

const validateSendClientRequest = [
  check("requestedUserId")
    .trim()
    .notEmpty()
    .withMessage("requestedUserId is required")
    .bail()
    .isUUID()
    .withMessage("requestedUserId must be a valid UUID"),
  handleValidation,
];

// ---- Business Profile ----
const validateUpdateBusinessProfile = [
  check("companyName").trim().notEmpty().withMessage("companyName is required"),
  check("businessType")
    .trim()
    .notEmpty()
    .withMessage("businessType is required"),
  check("industry").trim().notEmpty().withMessage("industry is required"),
  check("tin").trim().notEmpty().withMessage("tin is required"),
  check("businessAddress")
    .trim()
    .notEmpty()
    .withMessage("businessAddress is required"),
  check("phoneNumber").trim().notEmpty().withMessage("phoneNumber is required"),
  check("emailAddress")
    .trim()
    .notEmpty()
    .withMessage("emailAddress is required"),
  check("website").trim().notEmpty().withMessage("website is required"),
  check("logo")
    .optional()
    .trim()
    .isString()
    .withMessage("logo must be a valid URL string"),
  check("registrationDate")
    .optional()
    .trim()
    .isISO8601()
    .withMessage("registrationDate must be a valid ISO date"),
  handleValidation,
];

const validateClientBusinessProfile = [
  check("businessName").optional().trim().notEmpty(),
  check("rcNumber").optional().trim().isString(),
  check("tin").optional().trim().isString(),
  check("industry").optional().trim().isString(),
  check("turnoverBand").optional().trim().isString(),
  check("vatStatus").optional().trim().isString(),
  handleValidation,
];

const validateClientContact = [
  check("address").optional().trim().isString(),
  check("city").optional().trim().isString(),
  check("email").optional().trim().isEmail(),
  check("phone").optional().trim().isString(),
  check("website").optional().trim().isString(),
  handleValidation,
];

const validateCreateFiling = [
  check("taxType")
    .trim()
    .notEmpty()
    .withMessage("taxType is required")
    .isIn(["VAT", "WHT"])
    .withMessage("taxType must be VAT or WHT"),
  check("periodYear").isInt({ min: 2020, max: 2030 }).withMessage("periodYear must be valid"),
  check("periodMonth").isInt({ min: 1, max: 12 }).withMessage("periodMonth must be 1-12"),
  check("amount").isFloat({ min: 0 }).withMessage("amount must be non-negative"),
  check("paymentStatus").optional().isIn(["paid", "not_paid"]),
  check("dueDate").optional().isISO8601(),
  check("receiptUrl").optional().trim().isString(),
  check("documentUrl").optional().trim().isString(),
  check("evidenceVaultId").optional().trim().isString(),
  check("stateOfOperation").optional().trim().isString(),
  check("vatRegistrationNumber").optional().trim().isString(),
  handleValidation,
];

const validateTaxConfiguration = [
  check("vat").optional().isBoolean(),
  check("paye").optional().isBoolean(),
  check("wht").optional().isBoolean(),
  check("cit").optional().isBoolean(),
  check("stampDuties").optional().isBoolean(),
  handleValidation,
];

const validateUpgradeSubscription = [
  check("plan")
    .optional()
    .trim()
    .isString()
    .withMessage("plan must be a string"),
  handleValidation,
];

// ---- Tax / VAT ----
const validateCalculateVat = [
  check("vatType").trim().notEmpty().withMessage("vatType is required"),
  check("vatPeriod").trim().notEmpty().withMessage("vatPeriod is required"),
  check("startDate")
    .isISO8601()
    .withMessage("startDate must be a valid ISO date"),
  check("endDate").isISO8601().withMessage("endDate must be a valid ISO date"),
  check("salesAmountExclVat")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("salesAmountExclVat must be a non-negative number"),
  check("purchaseAmountExclVat")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("purchaseAmountExclVat must be a non-negative number"),
  check("vatRate")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("vatRate must be between 0 and 100"),
  handleValidation,
];

const validateSubmitVatReturn = [
  check("computationId")
    .notEmpty()
    .withMessage("computationId is required")
    .bail()
    .isUUID()
    .withMessage("computationId must be a valid UUID"),
  handleValidation,
];

// ---- Financials ----
const validateAddTransaction = [
  check("description").trim().notEmpty().withMessage("description is required"),
  check("date")
    .optional()
    .isISO8601()
    .withMessage("date must be a valid ISO date"),
  check("amount").optional().isFloat().withMessage("amount must be a number"),
  check("status").optional().trim().isString(),
  check("type").optional().trim().isString(),
  check("category").optional().trim().isString(),
  handleValidation,
];

const validateUploadFinancialDocument = [
  check("documentType")
    .trim()
    .notEmpty()
    .withMessage("documentType is required"),
  check("description").optional().trim().isString(),
  check("documentDate")
    .optional()
    .isISO8601()
    .withMessage("documentDate must be a valid ISO date"),
  check("amount").optional().isFloat().withMessage("amount must be a number"),
  check("currency").optional().trim().isString(),
  check("fileUrl").optional().trim().isString().withMessage("fileUrl must be a string (URL from media upload)"),
  handleValidation,
];

const validateCreateInvoice = [
  check("clientName").trim().notEmpty().withMessage("clientName is required"),
  check("clientAddress")
    .trim()
    .notEmpty()
    .withMessage("clientAddress is required"),
  check("clientEmail")
    .trim()
    .notEmpty()
    .isEmail()
    .withMessage("clientEmail must be a valid email"),
  check("dateIssued")
    .optional()
    .isISO8601()
    .withMessage("dateIssued must be a valid ISO date"),
  check("dueDate")
    .optional()
    .isISO8601()
    .withMessage("dueDate must be a valid ISO date"),
  check("totalAmount")
    .optional()
    .isFloat()
    .withMessage("totalAmount must be a number"),
  check("notes").optional().trim().isString(),
  check("lineItems").optional().isArray(),
  check("lineItems.*.description").optional().trim().isString(),
  check("lineItems.*.quantity").optional().isInt({ min: 0 }),
  check("lineItems.*.unitPrice").optional().isFloat({ min: 0 }),
  check("lineItems.*.total").optional().isFloat({ min: 0 }),
  handleValidation,
];

const validateUpdateInvoice = [
  check("clientName").optional().trim().notEmpty(),
  check("clientAddress").optional().trim().isString(),
  check("clientEmail").optional().trim().isEmail(),
  check("dateIssued").optional().isISO8601(),
  check("dueDate").optional().isISO8601(),
  check("notes").optional().trim().isString(),
  check("lineItems").optional().isArray(),
  check("lineItems.*.description").optional().trim().isString(),
  check("lineItems.*.quantity").optional().isInt({ min: 0 }),
  check("lineItems.*.unitPrice").optional().isFloat({ min: 0 }),
  check("lineItems.*.total").optional().isFloat({ min: 0 }),
  handleValidation,
];

// ---- Evidence Vault ----
const validateUploadEvidenceDocument = [
  check("documentName")
    .trim()
    .notEmpty()
    .withMessage("documentName is required"),
  check("category").trim().notEmpty().withMessage("category is required"),
  check("documentDate")
    .optional()
    .isISO8601()
    .withMessage("documentDate must be a valid ISO date"),
  check("description").optional().trim().isString(),
  check("fileUrl").optional().trim().isString().withMessage("fileUrl must be a string (URL from media upload)"),
  check("fileSizeKb").optional().isFloat({ min: 0 }),
  check("uploaderId").optional().trim().isString(),
  handleValidation,
];

const validateConvertToInvoice = [
  check("clientName").trim().notEmpty().withMessage("clientName is required"),
  check("clientAddress").trim().notEmpty().withMessage("clientAddress is required"),
  check("clientEmail").trim().notEmpty().isEmail().withMessage("clientEmail must be valid"),
  check("totalAmount").isFloat({ min: 0 }).withMessage("totalAmount must be non-negative"),
  handleValidation,
];

const validateUpdateDocumentDetails = [
  check("documentName").optional().trim().notEmpty(),
  check("category").optional().trim().isString(),
  check("documentDate").optional().isISO8601(),
  check("description").optional().trim().isString(),
  handleValidation,
];

const validateApproveDocument = [
  check("approverId").trim().notEmpty().withMessage("approverId is required"),
  check("notes").optional().trim().isString(),
  handleValidation,
];

const validateRejectDocument = [
  check("notes").optional().trim().isString(),
  handleValidation,
];

const validateInviteTeamMember = [
  check("name")
    .trim()
    .notEmpty()
    .withMessage("name is required")
    .isLength({ min: 2 })
    .withMessage("name must be at least 2 characters"),
  check("email")
    .trim()
    .notEmpty()
    .withMessage("email is required")
    .isEmail()
    .withMessage("email must be valid"),
  check("role")
    .isIn(["admin", "consultant"])
    .withMessage("role must be admin or consultant"),
  handleValidation,
];

const validateUpdateConsultantBusiness = [
  check("firmName").optional().trim().isString(),
  check("businessStructure").optional().trim().isString(),
  check("registrationType").optional().trim().isString(),
  check("rcNumber").optional().trim().isString(),
  check("yearOfIncorporation").optional().isInt({ min: 1900, max: 2100 }),
  check("countryOfRegistration").optional().trim().isString(),
  handleValidation,
];

const validateAcceptTeamInvitation = [
  check("code").trim().notEmpty().withMessage("code is required"),
  check("password")
    .isLength({ min: 6 })
    .withMessage("password must be at least 6 characters"),
  handleValidation,
];

const validateSignDocument = [
  check("signedBy").trim().notEmpty().withMessage("signedBy is required"),
  check("signerEmail")
    .trim()
    .notEmpty()
    .isEmail()
    .withMessage("signerEmail must be a valid email"),
  check("ipAddress").optional().trim().isString(),
  check("signatureMethod").optional().trim().isString(),
  check("documentHash").optional().trim().isString(),
  check("signatureData").optional().isString(),
  handleValidation,
];

export const enterpriseValidations = {
  validateCreateCompany,
  validateCreateInvitation,
  validateSendClientRequest,
  validateCompanyIdParam,
  validateClientIdParam,
  validateDocumentIdParam,
  validateFilingIdParam,
  validateInvoiceIdParam,
  validateInvitationIdParam,
  validateUpdateBusinessProfile,
  validateClientBusinessProfile,
  validateClientContact,
  validateCreateFiling,
  validateTaxConfiguration,
  validateUpgradeSubscription,
  validateCalculateVat,
  validateSubmitVatReturn,
  validateAddTransaction,
  validateUploadFinancialDocument,
  validateCreateInvoice,
  validateUpdateInvoice,
  validateUploadEvidenceDocument,
  validateConvertToInvoice,
  validateUpdateDocumentDetails,
  validateApproveDocument,
  validateRejectDocument,
  validateSignDocument,
  validateInviteTeamMember,
  validateAcceptTeamInvitation,
  validateUpdateConsultantBusiness,
};
