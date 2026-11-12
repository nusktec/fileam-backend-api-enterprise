import { prisma } from "../../../config/database";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { HttpStatusCode } from "../../../interfaces/system";
import { deviceFromUserAgent, locationFromIp } from "../utils";

export const featuresSessionsService = {
  async list(userId: string, currentSessionId?: string) {
    const sessions = await prisma.token.findMany({
      where: {
        userId,
        type: "refresh",
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ lastActiveAt: "desc" }, { createdAt: "desc" }],
    });

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        device: s.device || deviceFromUserAgent(s.userAgent),
        location: s.location || locationFromIp(s.ipAddress),
        lastActiveAt: (s.lastActiveAt ?? s.updatedAt).toISOString(),
        createdAt: s.createdAt.toISOString(),
        isCurrent: Boolean(currentSessionId && s.id === currentSessionId),
      })),
    };
  },

  async revoke(userId: string, sessionId: string, currentSessionId?: string) {
    const session = await prisma.token.findFirst({
      where: { id: sessionId, userId, type: "refresh" },
    });
    if (!session) {
      throw new HttpReplyError(HttpStatusCode.NOT_FOUND, "Session not found");
    }
    if (currentSessionId && session.id === currentSessionId) {
      throw new HttpReplyError(
        HttpStatusCode.BAD_REQUEST,
        "Cannot revoke the current session. Use logout instead.",
      );
    }

    await prisma.token.delete({ where: { id: session.id } });
    return { id: session.id, revoked: true };
  },
};
