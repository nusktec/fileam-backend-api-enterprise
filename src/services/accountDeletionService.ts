import { prisma } from "../config/database";

export type AccountDeletionReasonCategory = {
  code: string;
  label: string;
};

const REASON_CATEGORIES: AccountDeletionReasonCategory[] = [
  { code: "not_using", label: "I am not using the app anymore" },
  { code: "too_expensive", label: "Too expensive" },
  { code: "privacy_concerns", label: "Privacy or data concerns" },
  { code: "missing_features", label: "Missing features I need" },
  { code: "poor_experience", label: "Poor experience or bugs" },
  { code: "switched_service", label: "I switched to another service" },
  { code: "other", label: "Other" },
];

export const accountDeletionService = {
  getReasonCategories(): AccountDeletionReasonCategory[] {
    return REASON_CATEGORIES;
  },

  async requestAccountDeletion(userId: string): Promise<{ ok: true } | null> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    await prisma.user.update({
      where: { id: userId },
      data: { requestDelete: true },
    });
    return { ok: true };
  },

  /**
   * For unauthenticated web: set request_delete if a user exists for this email.
   * Response to the client should not reveal whether the email was found.
   */
  async requestAccountDeletionByEmail(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { id: true },
    });
    if (!user) return;
    await prisma.user.update({
      where: { id: user.id },
      data: { requestDelete: true },
    });
  },
};
