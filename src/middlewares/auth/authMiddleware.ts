import { Response, NextFunction } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { verifyToken } from "../../utils/jwt";
import { prisma } from "../../config/database";

interface AuthOptions {
  roles?: string[];
  permissions?: string[];
}

const authHandler = ({ roles = [], permissions = [] }: AuthOptions = {}) => {
  return async (
    req: IRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .json(outJson(false, "Access denied. No token provided."));
      return;
    }

    try {
      const decoded = verifyToken(token);

      if (decoded.type && decoded.type !== "access") {
        res
          .status(HttpStatusCode.FORBIDDEN)
          .json(outJson(false, "Invalid token type. Access token required."));
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      });

      if (!user) {
        res
          .status(HttpStatusCode.BAD_REQUEST)
          .json(outJson(false, "Invalid user."));
        return;
      }

      req.user = user as IRequest["user"];

      if (!roles.length && !permissions.length) {
        return next();
      }

      const userRoles = user.userRoles?.map((ur) => ur.role.name) ?? [];
      const userPermissions =
        user.userRoles?.flatMap(
          (ur) =>
            ur.role.rolePermissions?.map((rp) => rp.permission.name) ?? [],
        ) ?? [];

      const hasRole = roles.some((r) => userRoles.includes(r));
      const hasPermission = permissions.some((p) =>
        userPermissions.includes(p),
      );

      if (!hasRole && !hasPermission) {
        res
          .status(HttpStatusCode.FORBIDDEN)
          .json(
            outJson(false, "Access denied. Insufficient role or permission."),
          );
        return;
      }

      return next();
    } catch (error) {
      res
        .status(HttpStatusCode.FORBIDDEN)
        .json(outJson(false, "Invalid or expired token."));
    }
  };
};

export const authenticate = (roles?: string[]) =>
  authHandler({ roles: roles ?? [] });
