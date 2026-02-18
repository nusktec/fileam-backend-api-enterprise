import { Request } from "express";
import type { User, Role, Permission, UserRole } from "@prisma/client";

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
}
