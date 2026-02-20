import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { filingsService } from "../services/filingsService";

export const listFilings = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const status = req.query.status as string | undefined;
    const taxType = req.query.taxType as string | undefined;
    const data = await filingsService.list(userId, { status, taxType });
    res.status(HttpStatusCode.OK).json(outJson(true, "Filings retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve filings", null));
  }
};

export const getFilingById = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Filing ID required", null));
      return;
    }
    const data = await filingsService.getById(userId, id);
    if (!data) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Filing not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Filing retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve filing", null));
  }
};

export const getFilingDocument = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Filing ID required", null));
      return;
    }
    const documentUrl = await filingsService.getDocumentUrl(userId, id);
    if (!documentUrl) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Document not found for this filing", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Document URL", { url: documentUrl }));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get document", null));
  }
};

export const getFilingVaultLink = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Filing ID required", null));
      return;
    }
    const evidenceVaultId = await filingsService.getVaultLink(userId, id);
    if (!evidenceVaultId) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Evidence vault link not found for this filing", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Vault link", { evidenceVaultId }));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get vault link", null));
  }
};
