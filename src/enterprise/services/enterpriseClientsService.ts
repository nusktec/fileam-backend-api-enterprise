import { prisma } from "../../config/database";

export interface ClientCard {
  id: string;
  connectionId: string;
  businessName: string;
  rcNumber: string | null;
  status: string;
  vatStatus: string;
  nextFiling: string | null;
  riskLevel?: string;
  email: string;
  tin: string | null;
}

export const enterpriseClientsService = {
  async listClients(companyId: string): Promise<ClientCard[]> {
    const connections = await prisma.consultantConnection.findMany({
      where: { companyId },
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
        invitation: {
          select: { invitedBusinessName: true },
        },
      },
    });

    const userIds = connections.map((c) => c.userId);
    const businesses = await prisma.business.findMany({
      where: { userId: { in: userIds } },
    });
    const businessByUser = new Map(businesses.map((b) => [b.userId, b]));

    return connections.map((conn) => {
      const user = conn.user;
      const business = businessByUser.get(conn.userId);
      const displayName =
        conn.invitation?.invitedBusinessName ??
        user.organizationName ??
        business?.name ??
        (`${user.firstName} ${user.lastName}`.trim() || user.email);
      return {
        id: conn.userId,
        connectionId: conn.id,
        businessName: displayName,
        rcNumber: business?.rcNumber ?? null,
        status: conn.status === "active" ? "Active" : "Pending Approval",
        vatStatus: "Pending",
        nextFiling: null,
        email: user.email,
        tin: business?.tin ?? null,
      };
    });
  },

  async searchExistingBusinesses(
    companyId: string,
    query: string,
  ): Promise<
    Array<{
      id: string;
      businessName: string;
      rcNumber: string | null;
      email: string;
      tin: string | null;
      status: string;
    }>
  > {
    const q = (query || "").trim();
    if (!q || q.length < 2) return [];

    const alreadyConnectedUserIds = new Set(
      (
        await prisma.consultantConnection.findMany({
          where: { companyId },
          select: { userId: true },
        })
      ).map((r) => r.userId),
    );

    const businesses = await prisma.business.findMany({
      where: {
        user: { verified: true },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { rcNumber: { contains: q, mode: "insensitive" } },
          { tin: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, organizationName: true },
        },
      },
      take: 25,
    });

    const usersByQuery = await prisma.user.findMany({
      where: {
        verified: true,
        id: { notIn: Array.from(alreadyConnectedUserIds) },
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { organizationName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true, organizationName: true },
      take: 25,
    });

    const seen = new Set<string>();
    const result: Array<{
      id: string;
      businessName: string;
      rcNumber: string | null;
      email: string;
      tin: string | null;
      status: string;
    }> = [];

    for (const b of businesses) {
      if (alreadyConnectedUserIds.has(b.userId) || seen.has(b.userId)) continue;
      seen.add(b.userId);
      result.push({
        id: b.userId,
        businessName: b.name,
        rcNumber: b.rcNumber ?? null,
        email: b.user.email,
        tin: b.tin ?? null,
        status: "Active on FileAm",
      });
    }
    const userIdsFromUsers = usersByQuery.map((u) => u.id);
    const businessesForUsers = await prisma.business.findMany({
      where: { userId: { in: userIdsFromUsers } },
      select: { userId: true, name: true, rcNumber: true, tin: true },
    });
    const businessByUserId = new Map(businessesForUsers.map((b) => [b.userId, b]));

    for (const u of usersByQuery) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      const bus = businessByUserId.get(u.id);
      result.push({
        id: u.id,
        businessName: bus?.name ?? u.organizationName ?? (`${u.firstName} ${u.lastName}`.trim() || u.email),
        rcNumber: bus?.rcNumber ?? null,
        email: u.email,
        tin: bus?.tin ?? null,
        status: "Active on FileAm",
      });
    }

    return result.slice(0, 20);
  },
};
