import { prisma } from "../../config/database";

export interface AvailableClientCard {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationName: string | null;
  business: {
    id: string;
    name: string;
    rcNumber: string | null;
    tin: string | null;
    incomeType: string;
    stateOfResidence: string | null;
    streetAddress: string | null;
  } | null;
}

export async function listAvailableMobileUsers(
  query?: string,
): Promise<AvailableClientCard[]> {
  const q = (query ?? "").trim().toLowerCase();

  const usersWithConnection = await prisma.consultantConnection.findMany({
    where: { status: "active" },
    select: { userId: true },
  });
  const connectedUserIds = new Set(usersWithConnection.map((c) => c.userId));

  const where: Record<string, unknown> = {
    onboardingComplete: true,
    ...(connectedUserIds.size > 0 && { id: { notIn: Array.from(connectedUserIds) } }),
  };

  if (q.length >= 2) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" as const } },
      { firstName: { contains: q, mode: "insensitive" as const } },
      { lastName: { contains: q, mode: "insensitive" as const } },
      { organizationName: { contains: q, mode: "insensitive" as const } },
      { businesses: { some: { name: { contains: q, mode: "insensitive" as const } } } },
      { businesses: { some: { rcNumber: { contains: q, mode: "insensitive" as const } } } },
      { businesses: { some: { tin: { contains: q, mode: "insensitive" as const } } } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    include: {
      businesses: { take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return users.map((u) => {
    const business = u.businesses[0] ?? null;
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      organizationName: u.organizationName ?? null,
      business: business
        ? {
            id: business.id,
            name: business.name,
            rcNumber: business.rcNumber ?? null,
            tin: business.tin ?? null,
            incomeType: business.incomeType,
            stateOfResidence: business.stateOfResidence ?? null,
            streetAddress: business.streetAddress ?? null,
          }
        : null,
    };
  });
}
