import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../config/database";

export interface TokenPayload {
  userId: string;
  type?: "access" | "refresh";
}

export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ userId, type: "access" }, process.env.JWT_SECRET!, {
    expiresIn: "1d",
  });
};

export const generateRefreshToken = (): string => {
  return crypto.randomBytes(64).toString("hex");
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
};

export const saveRefreshToken = async (
  userId: string,
  refreshToken: string,
  expiresIn: number = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
): Promise<void> => {
  const expiresAt = new Date(Date.now() + expiresIn);
  await prisma.token.create({
    data: { userId, token: refreshToken, type: "refresh", expiresAt },
  });
};

export const validateRefreshToken = async (
  refreshToken: string,
  userId: string
): Promise<boolean> => {
  const tokenRecord = await prisma.token.findFirst({
    where: {
      token: refreshToken,
      userId,
      type: "refresh",
      expiresAt: { gt: new Date() },
    },
  });
  return !!tokenRecord;
};

export const revokeRefreshToken = async (
  refreshToken: string,
  userId: string
): Promise<void> => {
  await prisma.token.deleteMany({
    where: { token: refreshToken, userId, type: "refresh" },
  });
};

export const revokeAllUserRefreshTokens = async (userId: string): Promise<void> => {
  await prisma.token.deleteMany({
    where: { userId, type: "refresh" },
  });
};
