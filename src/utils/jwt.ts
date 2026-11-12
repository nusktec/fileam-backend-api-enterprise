import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../config/database";

export interface TokenPayload {
  userId: string;
  type?: "access" | "refresh";
  /** Refresh-token row id — identifies the active session. */
  sid?: string;
}

export const generateAccessToken = (
  userId: string,
  sessionId?: string,
): string => {
  return jwt.sign(
    {
      userId,
      type: "access",
      ...(sessionId ? { sid: sessionId } : {}),
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: "1d",
    },
  );
};

export const generateRefreshToken = (): string => {
  return crypto.randomBytes(64).toString("hex");
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
};

export type RefreshTokenMeta = {
  device?: string | null;
  location?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
};

export const saveRefreshToken = async (
  userId: string,
  refreshToken: string,
  expiresIn: number = 7 * 24 * 60 * 60 * 1000,
  meta?: RefreshTokenMeta,
): Promise<{ id: string }> => {
  const expiresAt = new Date(Date.now() + expiresIn);
  const now = new Date();
  const row = await prisma.token.create({
    data: {
      userId,
      token: refreshToken,
      type: "refresh",
      expiresAt,
      device: meta?.device ?? null,
      location: meta?.location ?? null,
      userAgent: meta?.userAgent ?? null,
      ipAddress: meta?.ipAddress ?? null,
      lastActiveAt: now,
    },
  });
  return { id: row.id };
};

export const revokeRefreshToken = async (
  refreshToken: string,
  userId: string,
): Promise<void> => {
  await prisma.token.deleteMany({
    where: { token: refreshToken, userId, type: "refresh" },
  });
};
