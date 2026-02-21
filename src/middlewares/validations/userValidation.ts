import { check } from "express-validator";
import { handleValidation } from "../errorHandler";

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
  changePasswordValidation,
};
