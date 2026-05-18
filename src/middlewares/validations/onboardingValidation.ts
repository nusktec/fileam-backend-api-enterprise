import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import {
  hasEmailPlusAlias,
  PLUS_ALIAS_EMAIL_MESSAGE,
} from "../../utils/emailPolicy";

function rejectPlusAliasInBody(field = "email") {
  return check(field)
    .custom((value) => {
      if (value == null || value === "") return true;
      if (typeof value !== "string") return true;
      if (hasEmailPlusAlias(value)) {
        throw new Error(PLUS_ALIAS_EMAIL_MESSAGE);
      }
      return true;
    });
}

const validateStepEmail = [
  check("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .bail()
    .isEmail()
    .withMessage("Enter a valid email"),
  rejectPlusAliasInBody("email"),
  handleValidation,
];

const validateStepEmailVerify = [
  check("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .bail()
    .isEmail()
    .withMessage("Enter a valid email"),
  rejectPlusAliasInBody("email"),
  check("code")
    .notEmpty()
    .withMessage("Verification code must be present")
    .bail()
    .isNumeric()
    .withMessage("Verification code is required")
    .isLength({ min: 5, max: 6 })
    .withMessage("Verification code must be 5–6 digits long"),
  handleValidation,
];

export const onboardingValidations = {
  validateStepEmail,
  validateStepEmailVerify,
};
