import { check } from "express-validator";
import { handleValidation } from "../errorHandler";

const validateLoginRequest = [
  check("email").trim().isEmail().withMessage("Enter a valid email"),
  check("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  handleValidation,
];

const validateEmailVerificationRequest = [
  check("email").trim().isEmail().withMessage("Enter a valid email"),
  handleValidation,
];

const validateEmailVerificationOTPRequest = [
  check("email").trim().isEmail().withMessage("Enter a valid email"),
  check("code")
    .notEmpty()
    .withMessage("Verification code must be present")
    .bail()
    .isNumeric()
    .withMessage("Verification code is required")
    .isLength({ min: 5, max: 6 })
    .withMessage("Verification code must be 6 digits long"),
  handleValidation,
];

const registerUserValidation = [
  check("email").trim().isEmail().withMessage("Enter a valid email"),
  check("firstName")
    .trim()
    .isString()
    .isLength({ min: 2 })
    .withMessage("First name must be at least 2 characters long"),
  check("lastName")
    .trim()
    .isString()
    .isLength({ min: 2 })
    .withMessage("Last name must be at least 2 characters long"),
  check("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  check("isVerified")
    .optional()
    .isBoolean()
    .withMessage("isVerified must be a boolean"),
  check("organizationName")
    .optional()
    .isString()
    .withMessage("Organization name must be a string"),
  check("organizationAddress")
    .optional()
    .isString()
    .withMessage("Organization address must be a string"),
  check("logo").optional().isString().withMessage("Logo must be a string"),
  handleValidation,
];

const validateRefreshTokenRequest = [
  check("refreshToken")
    .notEmpty()
    .withMessage("Refresh token is required")
    .isString()
    .withMessage("Refresh token must be a string"),
  handleValidation,
];

const validateLogoutRequest = [
  check("refreshToken")
    .notEmpty()
    .withMessage("Refresh token is required")
    .isString()
    .withMessage("Refresh token must be a string"),
  handleValidation,
];

export const validations = {
  validateLoginRequest,
  validateEmailVerificationRequest,
  validateEmailVerificationOTPRequest,
  registerUserValidation,
  validateRefreshTokenRequest,
  validateLogoutRequest,
};
