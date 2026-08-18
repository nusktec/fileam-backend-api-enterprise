import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { customersService } from "../services/customersService";

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

export const createCustomer = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      name: string;
      phone: string;
      address: string;
      businessName?: string;
      email?: string;
      tin?: string;
    };
    const data = await customersService.create(userId, body);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Customer created successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create customer", null));
  }
};

export const updateCustomer = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      name?: string;
      phone?: string;
      address?: string;
      businessName?: string | null;
      email?: string | null;
      tin?: string | null;
    };
    const data = await customersService.update(
      userId,
      paramId(req, "customerId"),
      body,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Customer updated successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update customer", null));
  }
};

export const getCustomer = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const data = await customersService.getById(
      userId,
      paramId(req, "customerId"),
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Customer retrieved successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get customer", null));
  }
};

export const getCustomerDashboard = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const data = await customersService.dashboard(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Customer dashboard retrieved successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get customer dashboard", null));
  }
};

export const uploadCustomerDocument = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const body = matchedData(req, { locations: ["body"], includeOptionals: true }) as {
      saleId: string;
      type: string;
      url: string;
    };
    const data = await customersService.uploadDocument(
      userId,
      paramId(req, "customerId"),
      body,
    );
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Customer document uploaded successfully.", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to upload customer document", null));
  }
};
