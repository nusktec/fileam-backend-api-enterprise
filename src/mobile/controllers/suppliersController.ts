import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { suppliersService } from "../services/suppliersService";

function replyError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res
      .status(error.statusCode)
      .json(outJson(false, error.message, error.data ?? null, error.errorCode));
    return true;
  }
  return false;
}

function paramId(req: IRequest, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : v!;
}

export const createSupplier = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      name: string;
      phone: string;
      address: string;
      businessName?: string;
      email?: string;
      contactPerson?: string;
      tin?: string;
    };
    const data = await suppliersService.create(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Supplier created successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create supplier", null));
  }
};

export const updateSupplier = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      name?: string;
      phone?: string;
      address?: string;
      businessName?: string | null;
      email?: string | null;
      contactPerson?: string | null;
      tin?: string | null;
    };
    const data = await suppliersService.update(
      userId,
      paramId(req, "supplierId"),
      body,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Supplier updated successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update supplier", null));
  }
};

export const getSupplier = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const data = await suppliersService.getById(
      userId,
      paramId(req, "supplierId"),
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Supplier retrieved successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get supplier", null));
  }
};

export const getSupplierDashboard = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const data = await suppliersService.dashboard(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Supplier dashboard retrieved successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get supplier dashboard", null));
  }
};

export const uploadSupplierDocument = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      expenseId: string;
      type: string;
      url: string;
    };
    const data = await suppliersService.uploadDocument(
      userId,
      paramId(req, "supplierId"),
      body,
    );
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Supplier document uploaded successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to upload supplier document", null));
  }
};
