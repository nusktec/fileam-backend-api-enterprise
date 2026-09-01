import { prisma } from "../config/database";
import { HttpReplyError } from "./httpReplyError";

export function normalizeDirectoryPhone(phone: string): string {
  return phone.trim();
}

export function normalizeDirectoryTin(
  tin: string | null | undefined,
): string | null {
  if (tin == null) return null;
  const s = tin.trim();
  return s.length > 0 ? s : null;
}

type DirectoryEntity = "customer" | "supplier";

async function assertPhoneUnique(
  entity: DirectoryEntity,
  userId: string,
  phone: string,
  excludeId?: string,
): Promise<void> {
  const normalized = normalizeDirectoryPhone(phone);
  const where = {
    userId,
    phone: normalized,
    ...(excludeId ? { NOT: { id: excludeId } } : {}),
  };

  const existing =
    entity === "customer"
      ? await prisma.customer.findFirst({ where, select: { id: true } })
      : await prisma.supplier.findFirst({ where, select: { id: true } });

  if (existing) {
    throw new HttpReplyError(
      409,
      `A ${entity} with this phone number already exists`,
      null,
      "DUPLICATE_CONTACT",
    );
  }
}

async function assertTinUnique(
  entity: DirectoryEntity,
  userId: string,
  tin: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  const normalized = normalizeDirectoryTin(tin);
  if (!normalized) return;

  const where = {
    userId,
    tin: normalized,
    ...(excludeId ? { NOT: { id: excludeId } } : {}),
  };

  const existing =
    entity === "customer"
      ? await prisma.customer.findFirst({ where, select: { id: true } })
      : await prisma.supplier.findFirst({ where, select: { id: true } });

  if (existing) {
    throw new HttpReplyError(
      409,
      `A ${entity} with this TIN already exists`,
      null,
      "DUPLICATE_CONTACT",
    );
  }
}

export async function assertCustomerContactUniqueness(
  userId: string,
  input: { phone: string; tin?: string | null },
  excludeCustomerId?: string,
): Promise<void> {
  await assertPhoneUnique("customer", userId, input.phone, excludeCustomerId);
  await assertTinUnique("customer", userId, input.tin, excludeCustomerId);
}

export async function assertSupplierContactUniqueness(
  userId: string,
  input: { phone: string; tin?: string | null },
  excludeSupplierId?: string,
): Promise<void> {
  await assertPhoneUnique("supplier", userId, input.phone, excludeSupplierId);
  await assertTinUnique("supplier", userId, input.tin, excludeSupplierId);
}
