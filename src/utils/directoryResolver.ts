import { prisma } from "../config/database";
import { HttpReplyError } from "./httpReplyError";

export type DirectoryRef = { id: string; name: string };

export async function resolveCustomerDirectory(
  userId: string,
  input: DirectoryRef,
): Promise<DirectoryRef> {
  const id = input.id?.trim();
  const name = input.name?.trim();
  if (!id) {
    throw new HttpReplyError(400, "customer.id is required");
  }
  const row = await prisma.customer.findFirst({
    where: {
      userId,
      OR: [{ customerCode: id }, { id }],
    },
    select: { customerCode: true, name: true },
  });
  if (!row) {
    throw new HttpReplyError(
      400,
      "Customer not found in Customer Directory.",
    );
  }
  return { id: row.customerCode, name: name || row.name };
}

export async function resolveSupplierDirectory(
  userId: string,
  input: DirectoryRef,
): Promise<DirectoryRef> {
  const id = input.id?.trim();
  const name = input.name?.trim();
  if (!id) {
    throw new HttpReplyError(400, "supplier.id is required");
  }
  const row = await prisma.supplier.findFirst({
    where: {
      userId,
      OR: [{ supplierCode: id }, { id }],
    },
    select: { supplierCode: true, name: true },
  });
  if (!row) {
    throw new HttpReplyError(
      400,
      "Supplier not found in Supplier Directory.",
    );
  }
  return { id: row.supplierCode, name: name || row.name };
}

export function extractCustomerFromBody(body: Record<string, unknown>): {
  nested?: DirectoryRef;
  legacyId?: string;
  legacyName?: string;
} {
  const customer = body.customer;
  if (
    customer &&
    typeof customer === "object" &&
    !Array.isArray(customer)
  ) {
    const c = customer as Record<string, unknown>;
    return {
      nested: {
        id: String(c.id ?? "").trim(),
        name: String(c.name ?? "").trim(),
      },
    };
  }
  const legacyName = body.customerName ?? body.Customer_name;
  const legacyId = body.customerId ?? body.Customer_id;
  return {
    legacyId:
      legacyId != null && String(legacyId).trim()
        ? String(legacyId).trim()
        : undefined,
    legacyName:
      legacyName != null && String(legacyName).trim()
        ? String(legacyName).trim()
        : undefined,
  };
}

export function extractSupplierFromBody(body: Record<string, unknown>): {
  nested?: DirectoryRef;
  legacyId?: string;
  legacyName?: string;
} {
  const supplier = body.supplier;
  if (
    supplier &&
    typeof supplier === "object" &&
    !Array.isArray(supplier)
  ) {
    const s = supplier as Record<string, unknown>;
    return {
      nested: {
        id: String(s.id ?? "").trim(),
        name: String(s.name ?? "").trim(),
      },
    };
  }
  const legacyName = body.supplierName ?? body.Supplier_name;
  const legacyId = body.supplierId ?? body.Supplier_Id;
  return {
    legacyId:
      legacyId != null && String(legacyId).trim()
        ? String(legacyId).trim()
        : undefined,
    legacyName:
      legacyName != null && String(legacyName).trim()
        ? String(legacyName).trim()
        : undefined,
  };
}

export async function resolveCustomerFields(
  userId: string,
  body: Record<string, unknown>,
): Promise<{ customerId: string | null; customerName: string | null }> {
  const extracted = extractCustomerFromBody(body);
  if (extracted.nested?.id) {
    const resolved = await resolveCustomerDirectory(userId, extracted.nested);
    return { customerId: resolved.id, customerName: resolved.name };
  }
  return {
    customerId: extracted.legacyId ?? null,
    customerName: extracted.legacyName ?? null,
  };
}

export async function resolveSupplierFields(
  userId: string,
  body: Record<string, unknown>,
): Promise<{ supplierId: string | null; supplierName: string | null }> {
  const extracted = extractSupplierFromBody(body);
  if (extracted.nested?.id) {
    const resolved = await resolveSupplierDirectory(userId, extracted.nested);
    return { supplierId: resolved.id, supplierName: resolved.name };
  }
  return {
    supplierId: extracted.legacyId ?? null,
    supplierName: extracted.legacyName ?? null,
  };
}
