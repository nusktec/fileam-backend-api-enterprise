import { Request } from "express";
import type { User, Role, Permission, UserRole } from "@prisma/client";
import type { OnboardingTokenPayload } from "../utils/onboardingToken";
import type { ConsultantOnboardingSession } from "@prisma/client";

export interface JWTUser {
  id: string;
  email?: string;
  role?: string;
}

export type RequestUser = Omit<User, "password" | "nextSaleNumber"> & {
  nextSaleNumber?: number;
  userRoles?: Array<
    UserRole & {
      role: Role & { rolePermissions: Array<{ permission: Permission }> };
    }
  >;
  currentOnboardingStep?: string | null;
};

export interface PaginationInfo {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder: "ASC" | "DESC";
}

export interface IRequest extends Request {
  user?: RequestUser;
  companyId?: string;
  linkedUserId?: string;
  onboardingPayload?: OnboardingTokenPayload;
  consultantOnboardingSession?: ConsultantOnboardingSession;
  pagination?: PaginationInfo;
}
