import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";
import { sendTeamInvitationEmail } from "../../services/emailService";
import { RandomAscii } from "../../utils/tools";
import type { TeamMemberRole } from "@prisma/client";

const INVITATION_EXPIRY_DAYS = 7;
const CODE_LENGTH = 32;

function getSetPasswordUrl(code: string): string {
  const baseUrl = process.env.BASE_URL || "https://fileam.app";
  return `${baseUrl}/enterprise/team-invite/accept?code=${code}`;
}

export const teamManagementService = {
  async inviteTeamMember(
    consultantUserId: string,
    data: { name: string; email: string; role: TeamMemberRole },
  ) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });
    if (existingUser) {
      const alreadyMember = await prisma.consultantTeamMember.findUnique({
        where: {
          consultantUserId_memberUserId: {
            consultantUserId,
            memberUserId: existingUser.id,
          },
        },
      });
      if (alreadyMember) {
        return {
          success: false as const,
          message: "This user is already a team member",
        };
      }
    }

    const pendingInvite = await prisma.teamMemberInvitation.findFirst({
      where: {
        consultantUserId,
        email: data.email.toLowerCase().trim(),
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });
    if (pendingInvite) {
      return {
        success: false as const,
        message: "An invitation has already been sent to this email",
      };
    }

    const code = RandomAscii(CODE_LENGTH);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    const invitation = await prisma.teamMemberInvitation.create({
      data: {
        consultantUserId,
        email: data.email.toLowerCase().trim(),
        name: data.name.trim(),
        role: data.role,
        code,
        expiresAt,
      },
    });

    const consultant = await prisma.user.findUnique({
      where: { id: consultantUserId },
      select: { firstName: true, lastName: true, organizationName: true },
    });
    const inviterName =
      consultant?.organizationName ??
      [consultant?.firstName, consultant?.lastName].filter(Boolean).join(" ") ??
      "A team member";

    const roleLabel = data.role === "admin" ? "Admin" : "Consultant (records and filing)";
    const setPasswordUrl = getSetPasswordUrl(code);

    const emailResult = await sendTeamInvitationEmail(
      invitation.email,
      invitation.name,
      inviterName,
      roleLabel,
      setPasswordUrl,
    );

    if (!emailResult.success) {
      await prisma.teamMemberInvitation.delete({
        where: { id: invitation.id },
      });
      return {
        success: false as const,
        message: "Failed to send invitation email",
      };
    }

    return {
      success: true as const,
      data: {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    };
  },

  async listInvitations(consultantUserId: string) {
    const invitations = await prisma.teamMemberInvitation.findMany({
      where: { consultantUserId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    const pendingCount = invitations.filter((i) => i.status === "pending").length;
    return {
      invitations,
      pendingCount,
    };
  },

  async getInvitationByCode(code: string) {
    const invitation = await prisma.teamMemberInvitation.findUnique({
      where: { code },
      include: {
        consultantUser: {
          select: { firstName: true, lastName: true, organizationName: true },
        },
      },
    });
    if (!invitation) return null;
    if (invitation.status !== "pending") return null;
    if (invitation.expiresAt < new Date()) return null;
    return {
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      inviterName:
        invitation.consultantUser.organizationName ??
        [invitation.consultantUser.firstName, invitation.consultantUser.lastName]
          .filter(Boolean)
          .join(" ") ??
        "Team",
    };
  },

  async acceptInvitation(code: string, password: string) {
    const invitation = await prisma.teamMemberInvitation.findUnique({
      where: { code },
      include: { consultantUser: true },
    });
    if (!invitation) {
      return { success: false as const, message: "Invalid invitation code" };
    }
    if (invitation.status !== "pending") {
      return { success: false as const, message: "Invitation already used" };
    }
    if (invitation.expiresAt < new Date()) {
      return { success: false as const, message: "Invitation has expired" };
    }
    if (!password || password.length < 6) {
      return { success: false as const, message: "Password must be at least 6 characters" };
    }

    let user = await prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (user) {
      const existingMember = await prisma.consultantTeamMember.findUnique({
        where: {
          consultantUserId_memberUserId: {
            consultantUserId: invitation.consultantUserId,
            memberUserId: user.id,
          },
        },
      });
      if (existingMember) {
        return { success: false as const, message: "You are already a team member" };
      }
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await prisma.user.create({
        data: {
          email: invitation.email,
          password: hashedPassword,
          firstName: invitation.name.split(" ")[0] || invitation.name,
          lastName: invitation.name.split(" ").slice(1).join(" ") || "",
          verified: true,
          enterpriseOnboardingComplete: true,
          enterpriseOnboardingStep: "complete",
        },
      });
    }

    await prisma.$transaction([
      prisma.consultantTeamMember.create({
        data: {
          consultantUserId: invitation.consultantUserId,
          memberUserId: user.id,
          role: invitation.role,
        },
      }),
      prisma.teamMemberInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
          acceptedUserId: user.id,
        },
      }),
    ]);

    return {
      success: true as const,
      data: { userId: user.id, email: user.email },
    };
  },

  async listTeamMembers(consultantUserId: string) {
    const members = await prisma.consultantTeamMember.findMany({
      where: { consultantUserId },
      include: {
        member: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.member.id,
      email: m.member.email,
      name: `${m.member.firstName} ${m.member.lastName}`.trim() || m.member.email,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  },
};
