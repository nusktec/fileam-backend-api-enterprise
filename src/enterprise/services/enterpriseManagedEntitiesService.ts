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
  consultantUserId: string,
  query?: string,
): Promise<ManagedEntityCard[]> {
  const connections = await prisma.consultantConnection.findMany({
    where: { consultantUserId, status: "active" },
    include: {
      user: {
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

  const clientUserIds = connections.map((c) => c.userId);
  const [clientCompanies, businesses] = await Promise.all([
    prisma.company.findMany({
      where: {
        ownerId: consultantUserId,
        linkedUserId: { in: clientUserIds },
      },
      select: { id: true, name: true, linkedUserId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.business.findMany({
      where: { userId: { in: clientUserIds } },
    }),
  ]);

  const businessByUser = new Map(businesses.map((b) => [b.userId, b]));
  const companyByUser = new Map(
    clientCompanies.map((c) => [c.linkedUserId!, c] as [string, typeof clientCompanies[0]]),
  );

  const entities: ManagedEntityCard[] = connections.map((conn) => {
    const user = conn.user;
    const business = businessByUser.get(conn.userId);
    const company = companyByUser.get(conn.userId);
    const displayName =
      company?.name ||
      user.organizationName ||
      business?.name ||
      `${user.firstName} ${user.lastName}`.trim() ||
      user.email ||
      "Unknown";
    return {
      id: conn.userId,
      name: displayName,
      type: "client" as const,
      source: "invited" as const,
      rcNumber: business?.rcNumber ?? null,
      tin: business?.tin ?? null,
      email: user.email ?? null,
      status: "Active",
      createdAt: company?.createdAt ?? conn.createdAt,
    };
  });

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
    select: { ownerId: true, linkedUserId: true },
  });
  if (!company) return { allowed: false };

  if (company.ownerId === userId)
    return { allowed: true, linkedUserId: company.linkedUserId ?? undefined };

  return { allowed: false };
}

export async function canAccessClient(
  consultantUserId: string,
  clientId: string,
): Promise<{ allowed: boolean; companyId?: string; linkedUserId?: string }> {
  const connection = await prisma.consultantConnection.findFirst({
    where: {
      consultantUserId,
      userId: clientId,
      status: "active",
    },
    select: { id: true },
  });
  if (!connection) return { allowed: false };

  const company = await prisma.company.findFirst({
    where: {
      ownerId: consultantUserId,
      linkedUserId: clientId,
    },
    select: { id: true },
  });

  return {
    allowed: true,
    companyId: company?.id,
    linkedUserId: clientId,
  };
}
