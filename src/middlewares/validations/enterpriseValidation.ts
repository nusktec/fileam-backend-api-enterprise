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
  check("companyId")
    .notEmpty()
    .withMessage("companyId is required")
    .bail()
    .isUUID()
    .withMessage("companyId must be a valid UUID"),
  check("invitedEmail")
    .trim()
    .notEmpty()
    .withMessage("invitedEmail is required")
    .bail()
    .isEmail()
    .withMessage("invitedEmail must be a valid email"),
  check("invitedBusinessName").optional().trim().isString(),
  check("expiresInHours").optional().isInt({ min: 1, max: 720 }).withMessage("expiresInHours must be between 1 and 720"),
  handleValidation,
];

// ---- Params (for routes under /company/:companyId and with :documentId / :invoiceId) ----
const validateCompanyIdParam = [
  param("companyId").isUUID().withMessage("Company ID must be a valid UUID"),
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
  validateCompanyIdParam,
  validateDocumentIdParam,
  validateInvoiceIdParam,
  validateUpdateBusinessProfile,
  validateUpgradeSubscription,
  validateCalculateVat,
  validateSubmitVatReturn,
  validateAddTransaction,
  validateUploadFinancialDocument,
  validateCreateInvoice,
  validateUpdateInvoice,
  validateUploadEvidenceDocument,
  validateUpdateDocumentDetails,
  validateApproveDocument,
  validateRejectDocument,
  validateSignDocument,
};
