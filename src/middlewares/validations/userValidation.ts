import { check } from "express-validator";
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
  handleValidation,
];

const updateBusinessProfileValidation = [
  check("businessName").optional().isString(),
  check("tin").optional().isString(),
  check("rcNumber").optional().isString(),
  check("businessType").optional().isString(),
  check("sector").optional().isString(),
  check("stateOfResidence").optional().isString(),
  check("bankAccount").optional().isString(),
  check("address").optional().isString(),
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
