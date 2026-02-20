import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { evidenceVaultService } from "../services/evidenceVaultService";

export const listDocuments = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const [documents, counts] = await Promise.all([
      evidenceVaultService.listDocuments(userId, { search, category }),
      evidenceVaultService.getCategoryCounts(userId),
    ]);
    res.status(HttpStatusCode.OK).json(outJson(true, "Documents retrieved", { documents, categoryCounts: counts }));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve documents", null));
  }
};

export const getDocumentById = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Document ID required", null));
      return;
    }
    const doc = await evidenceVaultService.getDocumentById(userId, id);
    if (!doc) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Document retrieved", doc));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve document", null));
  }
};

export const getDocumentDownload = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Document ID required", null));
      return;
    }
    const url = await evidenceVaultService.getDownloadUrl(userId, id);
    if (!url) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Download not available for this document", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Download URL", { url }));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get download", null));
  }
};
