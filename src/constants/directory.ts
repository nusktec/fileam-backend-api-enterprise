export const DIRECTORY_ENTITY_STATUS = ["ACTIVE", "INACTIVE"] as const;
export type DirectoryEntityStatus = (typeof DIRECTORY_ENTITY_STATUS)[number];

export const CUSTOMER_DOCUMENT_TYPES = [
  "SIGNED_QUOTATION",
  "PURCHASE_ORDER",
  "CONTRACT",
  "DELIVERY_CONFIRMATION",
  "CORRESPONDENCE",
  "PAYMENT_CONFIRMATION",
] as const;
export type CustomerDocumentType = (typeof CUSTOMER_DOCUMENT_TYPES)[number];

export const SUPPLIER_DOCUMENT_TYPES = [
  "SUPPLIER_INVOICE",
  "PAYMENT_RECEIPT",
  "PURCHASE_ORDER",
  "DELIVERY_NOTE",
  "CONTRACT",
  "WARRANTY_DOCUMENT",
] as const;
export type SupplierDocumentType = (typeof SUPPLIER_DOCUMENT_TYPES)[number];

export function isValidCustomerDocumentType(value: string): boolean {
  return (CUSTOMER_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isValidSupplierDocumentType(value: string): boolean {
  return (SUPPLIER_DOCUMENT_TYPES as readonly string[]).includes(value);
}
