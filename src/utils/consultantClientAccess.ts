import { prisma } from "../config/database";

/** Active consultant–client link required to act on behalf of the client. */
export async function assertConsultantClientAccess(
  consultantUserId: string,
  clientUserId: string,
): Promise<boolean> {
  const row = await prisma.consultantConnection.findFirst({
    where: {
      consultantUserId,
      userId: clientUserId,
      status: "active",
    },
  });
  return !!row;
}
