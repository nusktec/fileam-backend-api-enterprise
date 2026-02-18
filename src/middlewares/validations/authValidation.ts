/**
 Author: Aka'aba Musa Akidi
 Git: kingakidi
 **/
import { check, param, query, validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";
import { outJson } from "../../utils/renders";
import { handleValidation } from "../errorHandler";

//validation on login
const validateLoginRequest = [
  check("email").isEmail().withMessage("Enter a valid email"),
  check("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  handleValidation,
];

//validation on login
const validateEmailVerificationRequest = [
  check("email").isEmail().withMessage("Enter a valid email"),
  handleValidation,
];

const validateEmailVerificationOTPRequest = [
  check("email").isEmail().withMessage("Enter a valid email"),
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

// validation on business register
const registerUserValidation = [
  check("email").isEmail().withMessage("Enter a valid email"),
  check("firstName")
    .isString()
    .isLength({ min: 2 })
    .withMessage("First name must be at least 2 characters long"),
  check("lastName")
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
  check("logo")
    .optional()
    .isString()
    .withMessage("Logo must be a string"),
  handleValidation,
];

// validation for refresh token
const validateRefreshTokenRequest = [
  check("refreshToken")
    .notEmpty()
    .withMessage("Refresh token is required")
    .isString()
    .withMessage("Refresh token must be a string"),
  handleValidation,
];

// validation for logout
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
