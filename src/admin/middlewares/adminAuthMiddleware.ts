import { Response, NextFunction } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { verifyAdminToken } from "../../utils/adminJwt";
import { prisma } from "../../config/database";

export type RequestWithAdmin = IRequest & {
  admin?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
};

export const authenticateAdmin = () => {
  return async (
    req: RequestWithAdmin,
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
      const decoded = verifyAdminToken(token);
      const admin = await prisma.admin.findUnique({
        where: { id: decoded.adminId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          active: true,
        },
      });
      if (!admin || !admin.active) {
        res
          .status(HttpStatusCode.FORBIDDEN)
          .json(outJson(false, "Admin account inactive or not found."));
        return;
      }
      req.admin = admin;
      next();
    } catch {
      res
        .status(HttpStatusCode.FORBIDDEN)
        .json(outJson(false, "Invalid or expired admin token."));
    }
  };
};
