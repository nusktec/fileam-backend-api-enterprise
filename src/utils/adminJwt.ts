import jwt from "jsonwebtoken";

export interface AdminTokenPayload {
  adminId: string;
  type: "admin_access";
}

export const generateAdminAccessToken = (adminId: string): string => {
  return jwt.sign(
    { adminId, type: "admin_access" } satisfies AdminTokenPayload,
    process.env.JWT_SECRET!,
    { expiresIn: "12h" },
  );
};

export const verifyAdminToken = (token: string): AdminTokenPayload => {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as AdminTokenPayload;
  if (payload.type !== "admin_access" || !payload.adminId) {
    throw new Error("Invalid admin token");
  }
  return payload;
};
