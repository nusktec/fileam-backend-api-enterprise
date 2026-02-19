import { Request } from "express";
import type { User, Role, Permission, UserRole } from "@prisma/client";
import type { OnboardingTokenPayload } from "../utils/onboardingToken";

export interface JWTUser {
  id: string;
  email?: string;
  role?: string;
}

export type RequestUser = User & {
  userRoles?: Array<UserRole & { role: Role & { rolePermissions: Array<{ permission: Permission }> } }>;
};

export interface IRequest extends Request {
  user?: RequestUser;
  onboardingPayload?: OnboardingTokenPayload;
}
