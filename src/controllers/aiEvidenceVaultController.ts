import { Response } from "express";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { IRequest } from "../interfaces/CustomRequest";
import { prisma } from "../config/database";
import { parseDateRangeQuery } from "../utils/dateRangeQuery";
import {
  EVIDENCE_CATEGORIES,
  evidenceVaultService,
} from "../mobile/services/evidenceVaultService";

async function resolveAiClient(
  req: IRequest,
  res: Response,
): Promise<string | null> {
  const clientId = req.aiClientId;
  if (!clientId) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, "Missing client ID", null));
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: clientId } });
  if (!user) {
    res
      .status(HttpStatusCode.NOT_FOUND)
      .json(outJson(false, "Client not found", null));
    return null;
  }
  return clientId;
}

/** GET /ai/evidence-vault/documents */
export async function listEvidenceVaultDocuments(
  req: IRequest,
  res: Response,
): Promise<void> {
  const clientId = await resolveAiClient(req, res);
  if (!clientId) return;

  const search = req.query.search as string | undefined;
  const category = req.query.category as string | undefined;
  if (
    category &&
    !EVIDENCE_CATEGORIES.includes(
      category.toLowerCase() as (typeof EVIDENCE_CATEGORIES)[number],
    )
  ) {
    res.status(HttpStatusCode.BAD_REQUEST).json(
      outJson(
        false,
        `Invalid category. Must be one of: ${EVIDENCE_CATEGORIES.join(", ")}`,
        null,
      ),
    );
    return;
  }

  const dr = parseDateRangeQuery(req.query as Record<string, unknown>);
  if (!dr.ok) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, dr.message, null));
    return;
  }

  try {
    const [documents, categoryCounts] = await Promise.all([
      evidenceVaultService.listDocuments(clientId, {
        search,
        category,
        dateFrom: dr.range.dateFrom,
        dateTo: dr.range.dateTo,
      }),
      evidenceVaultService.getCategoryCounts(clientId),
    ]);
    res.status(HttpStatusCode.OK).json(
      outJson(true, "Evidence vault documents retrieved", {
        documents,
        categoryCounts,
      }),
    );
  } catch (error) {
    console.error("AI listEvidenceVaultDocuments error:", error);
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve evidence vault", null));
  }
}

/** GET /ai/evidence-vault/documents/:id */
export async function getEvidenceVaultDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const clientId = await resolveAiClient(req, res);
  if (!clientId) return;

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Document id is required", null));
    return;
  }

  try {
    const doc = await evidenceVaultService.getDocumentById(clientId, id);
    if (!doc) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Document not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Document retrieved", doc));
  } catch (error) {
    console.error("AI getEvidenceVaultDocument error:", error);
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve document", null));
  }
}

/**
 * GET /ai/evidence-vault/documents/:id/download
 * Returns { url } when a stored URL exists; otherwise streams a generated PDF when possible.
 */
export async function downloadEvidenceVaultDocument(
  req: IRequest,
  res: Response,
): Promise<void> {
  const clientId = await resolveAiClient(req, res);
  if (!clientId) return;

  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Document id is required", null));
    return;
  }

  try {
    const doc = await evidenceVaultService.getDocumentById(clientId, id);
    if (!doc) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Document not found", null));
      return;
    }

    const url = await evidenceVaultService.getDownloadUrl(clientId, id);
    if (url) {
      res.status(HttpStatusCode.OK).json(outJson(true, "Download URL", { url }));
      return;
    }

    if (evidenceVaultService.canGeneratePdf(id)) {
      const { generatePdfForDocument } = await import(
        "../mobile/services/evidenceVaultPdfService"
      );
      const result = await generatePdfForDocument(clientId, id);
      if (result) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${result.filename}"`,
        );
        res.setHeader("Content-Length", result.buffer.length);
        res.status(HttpStatusCode.OK).send(result.buffer);
        return;
      }
    }

    res
      .status(HttpStatusCode.NOT_FOUND)
      .json(outJson(false, "Download not available", null));
  } catch (error) {
    console.error("AI downloadEvidenceVaultDocument error:", error);
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to download document", null));
  }
}
