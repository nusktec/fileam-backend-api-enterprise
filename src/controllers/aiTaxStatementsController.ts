import { Response } from "express";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { IRequest } from "../interfaces/CustomRequest";
import { prisma } from "../config/database";
import { HttpReplyError } from "../utils/httpReplyError";
import { getTaxStatement } from "../ai/taxStatements/taxStatementService";

/** GET /ai/tax-statements?incomeType=&year= */
export async function getAiTaxStatement(
  req: IRequest,
  res: Response,
): Promise<void> {
  const clientId = req.aiClientId;
  if (!clientId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Missing client ID", null));
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: clientId } });
  if (!user) {
    res
      .status(HttpStatusCode.NOT_FOUND)
      .json(outJson(false, "Client not found", null));
    return;
  }

  try {
    const data = await getTaxStatement(
      clientId,
      req.query.incomeType as string | undefined,
      req.query.year,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Tax statement retrieved successfully.", data));
  } catch (error) {
    if (error instanceof HttpReplyError) {
      res
        .status(error.statusCode)
        .json(outJson(false, error.message, error.data));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to build tax statement", null));
  }
}
