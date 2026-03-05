import { prisma } from "../../config/database";

export interface BusinessListItem {
  id: string;
  userId: string;
  name: string;
  rcNumber: string | null;
  tin: string | null;
  incomeType: string;
  stateOfResidence: string | null;
  email: string;
  ownerName: string;
  createdAt: Date;
}

export const enterpriseBusinessesService = {
  async listAllBusinesses(options?: { q?: string }): Promise<BusinessListItem[]> {
    const q = (options?.q ?? "").trim();

    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { rcNumber: { contains: q, mode: "insensitive" as const } },
            { tin: { contains: q, mode: "insensitive" as const } },
            {
              user: {
                OR: [
                  { email: { contains: q, mode: "insensitive" as const } },
                  { firstName: { contains: q, mode: "insensitive" as const } },
                  { lastName: { contains: q, mode: "insensitive" as const } },
                  { organizationName: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          ],
        }
      : undefined;

    const businesses = await prisma.business.findMany({
      where,
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

    return businesses.map((b) => ({
      id: b.id,
      userId: b.userId,
      name: b.name,
      rcNumber: b.rcNumber ?? null,
      tin: b.tin ?? null,
      incomeType: b.incomeType,
      stateOfResidence: b.stateOfResidence ?? null,
      email: b.user.email,
      ownerName:
        b.user.organizationName?.trim() ||
        `${[b.user.firstName, b.user.lastName].filter(Boolean).join(" ")}`.trim() ||
        b.user.email,
      createdAt: b.createdAt,
    }));
  },
};
