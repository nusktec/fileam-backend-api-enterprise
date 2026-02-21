import { Response } from "express";
import { prisma } from "../../config/database";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { RandomAscii } from "../../utils/tools";

export async function createCompany(
  req: IRequest,
  res: Response,
): Promise<void> {
  const name = (req.body?.name as string)?.trim();
  try {
    const company = await prisma.company.create({
      data: { name: name! },
    });
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Company created", company));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create company", null));
  }
}

export async function createInvitation(
  req: IRequest,
  res: Response,
): Promise<void> {
  const { companyId, invitedEmail, invitedBusinessName, expiresInHours } =
    req.body;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    res
      .status(HttpStatusCode.NOT_FOUND)
      .json(outJson(false, "Company not found", null));
    return;
  }
  const hours = Math.min(Math.max(Number(expiresInHours) || 168, 1), 720);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  let code = RandomAscii(6);
  let exists = await prisma.invitation.findUnique({ where: { code } });
  while (exists) {
    code = RandomAscii(6);
    exists = await prisma.invitation.findUnique({ where: { code } });
  }
  try {
    const invitation = await prisma.invitation.create({
      data: {
        code,
        companyId,
        invitedEmail: String(invitedEmail).trim().toLowerCase(),
        invitedBusinessName: invitedBusinessName
          ? String(invitedBusinessName).trim()
          : null,
        status: "pending",
        expiresAt,
      },
    });
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Invitation created", invitation));
  } catch (e) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create invitation", null));
  }
}
