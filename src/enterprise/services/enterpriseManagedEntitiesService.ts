import { prisma } from "../../config/database";

export interface ManagedEntityCard {
  id: string;
  name: string;
  type: "company" | "client";
  source: "created" | "invited";
  rcNumber: string | null;
  tin: string | null;
  email: string | null;
  status: string;
  createdAt: Date;
}

export async function listManagedEntities(
  userId: string,
  query?: string,
): Promise<ManagedEntityCard[]> {
  const consultantCompany = await prisma.company.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const entities: ManagedEntityCard[] = [];

  if (consultantCompany) {
    const ownedCompanies = await prisma.company.findMany({
      where: {
        ownerId: userId,
        linkedUserId: null,
        managedByCompanyId: null,
      },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    for (const c of ownedCompanies) {
      entities.push({
        id: c.id,
        name: c.name,
        type: "company",
        source: "created",
        rcNumber: null,
        tin: null,
        email: null,
        status: "Active",
        createdAt: c.createdAt,
      });
    }

    const clientCompanies = await prisma.company.findMany({
      where: {
        managedByCompanyId: consultantCompany.id,
        linkedUserId: { not: null },
      },
      include: {
        linkedUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            organizationName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const userIds = clientCompanies
      .map((c) => c.linkedUserId)
      .filter((id): id is string => id != null);
    const businesses = await prisma.business.findMany({
      where: { userId: { in: userIds } },
    });
    const businessByUser = new Map(businesses.map((b) => [b.userId, b]));

    for (const c of clientCompanies) {
      const user = c.linkedUser;
      const business = user ? businessByUser.get(user.id) : null;
      const displayName =
        c.name ||
        user?.organizationName ||
        business?.name ||
        (user ? `${user.firstName} ${user.lastName}`.trim() : "") ||
        user?.email ||
        "Unknown";
      entities.push({
        id: c.id,
        name: displayName,
        type: "client",
        source: "invited",
        rcNumber: business?.rcNumber ?? null,
        tin: business?.tin ?? null,
        email: user?.email ?? null,
        status: "Active",
        createdAt: c.createdAt,
      });
    }
  }

  entities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (!query || query.trim().length < 2) return entities;

  const q = query.trim().toLowerCase();
  return entities.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      (e.email ?? "").toLowerCase().includes(q) ||
      (e.rcNumber ?? "").toLowerCase().includes(q) ||
      (e.tin ?? "").toLowerCase().includes(q),
  );
}

export async function canAccessCompany(
  userId: string,
  companyId: string,
): Promise<{ allowed: boolean; linkedUserId?: string }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      ownerId: true,
      managedByCompanyId: true,
      linkedUserId: true,
      managedByCompany: { select: { ownerId: true } },
    },
  });
  if (!company) return { allowed: false };

  if (company.ownerId === userId) return { allowed: true, linkedUserId: company.linkedUserId ?? undefined };
  if (company.managedByCompany?.ownerId === userId)
    return { allowed: true, linkedUserId: company.linkedUserId ?? undefined };

  return { allowed: false };
}
