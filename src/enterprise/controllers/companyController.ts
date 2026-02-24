import { Response } from "express";
import { matchedData } from "express-validator";
import { prisma } from "../../config/database";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { RandomAscii } from "../../utils/tools";

export async function createCompany(
  req: IRequest,
  res: Response,
): Promise<void> {
  const data = matchedData(req, { locations: ["body"] }) as { name: string };
  try {
    const company = await prisma.company.create({
      data: { name: data.name },
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
  const data = matchedData(req, {
    locations: ["body"],
    includeOptionals: true,
  }) as {
    companyId: string;
    invitedEmail: string;
    invitedBusinessName?: string;
    expiresInHours?: number;
  };
  const { companyId, invitedEmail, invitedBusinessName, expiresInHours } = data;
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
        invitedEmail: invitedEmail.trim().toLowerCase(),
        invitedBusinessName: invitedBusinessName ? invitedBusinessName.trim() : null,
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
