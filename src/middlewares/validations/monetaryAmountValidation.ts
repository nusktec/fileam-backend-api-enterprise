import { check } from "express-validator";
import { validateMonetaryAmount } from "../../utils/monetaryAmount";

function monetaryCustom(fieldLabel: string) {
  return (value: unknown) => {
    const msg = validateMonetaryAmount(value, fieldLabel);
    if (msg) throw new Error(msg);
    return true;
  };
}

/** Required monetary field (e.g. create expense amount). */
export function requiredMonetaryAmount(field: string, fieldLabel = "Amount") {
  return check(field)
    .isFloat({ min: 0 })
    .withMessage(`${fieldLabel} must be a positive number`)
    .custom(monetaryCustom(fieldLabel));
}

/** Optional monetary field (e.g. PATCH expense amount). */
export function optionalMonetaryAmount(field: string, fieldLabel = "Amount") {
  return check(field)
    .optional({ values: "null" })
    .isFloat({ min: 0 })
    .withMessage(`${fieldLabel} must be a positive number`)
    .custom((value) => {
      if (value === undefined || value === null || value === "") return true;
      return monetaryCustom(fieldLabel)(value);
    });
}
