import { check } from "express-validator";
import {
  PRIMARY_BUSINESS_ACTIVITY_VALUES,
  PROVIDES_PROFESSIONAL_SERVICES_VALUES,
} from "../../constants/taxEligibility";
import { handleValidation } from "../errorHandler";
import {
  normalizeSolopreneurRegistration,
  normalizeTaxPersona,
} from "../../constants/taxPersona";

const updateProfileValidation = [
  check("firstName")
    .optional()
    .isString()
    .isLength({ min: 2 })
    .withMessage("First name must be at least 2 characters"),
  check("lastName")
    .optional()
    .isString()
    .isLength({ min: 2 })
    .withMessage("Last name must be at least 2 characters"),
  check("address").optional().isString(),
  check("state").optional().isString(),
  check("lga").optional().isString(),
  check("purpose").optional().isString(),
  check("roleDescription").optional().isString(),
  check("teamSize").optional().isInt({ min: 0 }),
  check("adminCount").optional().isInt({ min: 0 }),
  check("organizationName").optional().isString(),
  check("organizationAddress").optional().isString(),
  check("logo").optional().isString(),
  check("taxPersona")
    .optional({ nullable: true })
    .custom((v) => {
      if (v === null || v === undefined || v === "") return true;
      return normalizeTaxPersona(String(v)) !== null;
    })
    .withMessage(
      "Invalid taxPersona (SOLOPRENEUR | TRADER | PAYEE | GIG_WORKER | REMOTE_WORKER)",
    ),
  check("solopreneurRegistration")
    .optional({ nullable: true })
    .custom((v) => {
      if (v === null || v === undefined || v === "") return true;
      return normalizeSolopreneurRegistration(String(v)) !== null;
    })
    .withMessage(
      "Invalid solopreneurRegistration (NOT_REGISTERED | BUSINESS_NAME | LIMITED_COMPANY)",
    ),
  check("employmentGrossSalaryMonthly")
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage(
      "employmentGrossSalaryMonthly must be a non-negative number or null",
    ),
  handleValidation,
];

function optionalBusinessProfileMoney(field: string) {
  return check(field)
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${field} must be a JSON number`);
      }
      if (value < 0) {
        throw new Error(`${field} must be greater than or equal to 0`);
      }
      return true;
    });
}

const updateBusinessProfileValidation = [
  check("businessName").optional().isString(),
  check("tin").optional().isString(),
  check("rcNumber").optional().isString(),
  check("businessType").optional().isString(),
  check("sector").optional({ nullable: true }).isString(),
  check("stateOfResidence").optional().isString(),
  check("bankAccount").optional().isString(),
  check("address").optional().isString(),
  optionalBusinessProfileMoney("totalFixedAssets"),
  optionalBusinessProfileMoney("annualGrossTurnover"),
  check("providesProfessionalServices")
    .optional({ nullable: true })
    .custom((v) => {
      if (v === null || v === undefined || v === "") return true;
      return (PROVIDES_PROFESSIONAL_SERVICES_VALUES as readonly string[]).includes(
        String(v).trim().toUpperCase(),
      );
    })
    .withMessage(
      `providesProfessionalServices must be one of: ${PROVIDES_PROFESSIONAL_SERVICES_VALUES.join(", ")}`,
    ),
  check("professionalService")
    .optional({ nullable: true })
    .isBoolean()
    .withMessage("professionalService must be a JSON boolean or null"),
  check("primaryBusinessActivity")
    .optional({ nullable: true })
    .custom((v) => {
      if (v === null || v === undefined || v === "") return true;
      const normalized = String(v).trim().toUpperCase().replace(/[\s/]+/g, "_");
      return (PRIMARY_BUSINESS_ACTIVITY_VALUES as readonly string[]).includes(
        normalized,
      );
    })
    .withMessage(
      `primaryBusinessActivity must be one of: ${PRIMARY_BUSINESS_ACTIVITY_VALUES.join(", ")}`,
    ),
  check("logo")
    .optional({ values: "null" })
    .isString()
    .withMessage("Logo must be a string or null"),
  handleValidation,
];

const changePasswordValidation = [
  check("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  check("newPassword")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters long"),
  handleValidation,
];

export const validations = {
  updateProfileValidation,
  updateBusinessProfileValidation,
  changePasswordValidation,
};
