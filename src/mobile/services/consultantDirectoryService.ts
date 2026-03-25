import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { RandomAscii } from "../../utils/tools";
import { sendConsultantIncomingClientRequestEmail } from "../../services/emailService";

export interface ConsultantListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationName: string | null;
  phone: string | null;
}

export async function listAvailableConsultants(
  clientUserId: string,
  opts?: { q?: string; page?: number; limit?: number },
): Promise<{ data: ConsultantListItem[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, opts?.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));
  const q = (opts?.q ?? "").trim();

  const activeConnection = await prisma.consultantConnection.findFirst({
    where: { userId: clientUserId, status: "active" },
    select: { id: true },
  });
  if (activeConnection) {
    return { data: [], total: 0, page, limit };
  }

  const pendingInvites = await prisma.invitation.findMany({
    where: {
      requestedUserId: clientUserId,
      status: "pending",
      expiresAt: { gte: new Date() },
    },
    select: { consultantUserId: true },
  });
  const blockedConsultantIds = new Set(
    pendingInvites.map((i) => i.consultantUserId),
  );

  const where: Prisma.UserWhereInput = {
    enterpriseOnboardingComplete: true,
    AND: [
      { id: { not: clientUserId } },
      ...(blockedConsultantIds.size > 0
        ? [{ id: { notIn: [...blockedConsultantIds] } }]
        : []),
    ],
  };

  if (q.length >= 2) {
    const term = q.toLowerCase();
    where.AND = [
      {
        OR: [
          { email: { contains: term, mode: "insensitive" } },
          { firstName: { contains: term, mode: "insensitive" } },
          { lastName: { contains: term, mode: "insensitive" } },
          { organizationName: { contains: term, mode: "insensitive" } },
        ],
      },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        organizationName: true,
        phone: true,
      },
      orderBy: [{ organizationName: "asc" }, { email: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      organizationName: u.organizationName ?? null,
      phone: u.phone ?? null,
    })),
    total,
    page,
    limit,
  };
}

export async function requestConsultantConnection(
  clientUserId: string,
  consultantUserId: string,
): Promise<
  | { success: true; data: { id: string; status: string; expiresAt: Date } }
  | { success: false; message: string }
> {
  if (clientUserId === consultantUserId) {
    return { success: false, message: "You cannot request yourself." };
  }

  const [client, consultant] = await Promise.all([
    prisma.user.findUnique({
      where: { id: clientUserId },
      include: { businesses: { take: 1 } },
    }),
    prisma.user.findUnique({ where: { id: consultantUserId } }),
  ]);

  if (!client?.onboardingComplete) {
    return { success: false, message: "Complete onboarding before requesting a consultant." };
  }
  if (!consultant?.enterpriseOnboardingComplete) {
    return { success: false, message: "This user is not available as a consultant." };
  }

  const existingConnection = await prisma.consultantConnection.findFirst({
    where: { userId: clientUserId, status: "active" },
  });
  if (existingConnection) {
    return { success: false, message: "You already have an active consultant." };
  }

  const now = new Date();
  const existingPending = await prisma.invitation.findFirst({
    where: {
      consultantUserId,
      requestedUserId: clientUserId,
      status: "pending",
      expiresAt: { gt: now },
    },
  });
  if (existingPending) {
    return {
      success: false,
      message: "You already have a pending request for this consultant.",
    };
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  let code = RandomAscii(6);
  let exists = await prisma.invitation.findUnique({ where: { code } });
  while (exists) {
    code = RandomAscii(6);
    exists = await prisma.invitation.findUnique({ where: { code } });
  }

  let invitation;
  try {
    invitation = await prisma.invitation.create({
      data: {
        code,
        consultantUserId,
        requestedUserId: clientUserId,
        initiator: "client_to_consultant",
        invitedEmail: consultant.email,
        invitedBusinessName:
          client.businesses[0]?.name ?? client.organizationName ?? null,
        invitedContactName:
          `${client.firstName} ${client.lastName}`.trim() || null,
        status: "pending",
        expiresAt,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        success: false,
        message:
          "Unable to send this request while another invitation is tied to your account. Apply the latest database migration or clear old pending invitations.",
      };
    }
    throw err;
  }

  const clientDisplayName =
    client.organizationName ??
    client.businesses[0]?.name ??
    (`${client.firstName} ${client.lastName}`.trim() || client.email);

  const consultantGreeting =
    `${consultant.firstName} ${consultant.lastName}`.trim() ||
    consultant.organizationName ||
    consultant.email;

  const emailResult = await sendConsultantIncomingClientRequestEmail(
    consultant.email,
    consultantGreeting,
    clientDisplayName,
    invitation.id,
    invitation.code,
    invitation.expiresAt,
  );
  if (!emailResult.success) {
    console.error(
      "Failed to send consultant incoming request email:",
      emailResult.error,
    );
  }

  return {
    success: true,
    data: {
      id: invitation.id,
      status: "pending",
      expiresAt: invitation.expiresAt,
    },
  };
}
