import { Response } from "express";
import { matchedData, validationResult } from "express-validator";
import { IRequest } from "../../interfaces/CustomRequest";
import { HttpStatusCode } from "../../interfaces/system";
import { getAuthUserId } from "../../utils/authHelpers";
import { outJson } from "../../utils/renders";
import { HttpReplyError } from "../../utils/httpReplyError";
import { employersService } from "../services/employersService";

function paramId(req: IRequest, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : v!;
}

function replyError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    const payload: Record<string, unknown> = {
      status: false,
      message: error.message,
      data: error.data ?? null,
    };
    if (
      error.statusCode === 422 &&
      error.data &&
      typeof error.data === "object" &&
      !Array.isArray(error.data)
    ) {
      payload.errors = error.data;
    }
    res.status(error.statusCode).json(payload);
    return true;
  }
  return false;
}

function ensureValid(req: IRequest) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const fieldErrors: Record<string, string[]> = {};
    for (const e of errors.array()) {
      if (e.type === "field") {
        const key = e.path;
        fieldErrors[key] = fieldErrors[key] ?? [];
        fieldErrors[key].push(e.msg);
      }
    }
    throw new HttpReplyError(422, "Validation failed", fieldErrors);
  }
}

export const createEmployer = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    });
    const data = await employersService.create(userId, body as never);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Employer saved", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create employer", null));
  }
};

export const listEmployers = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const query = matchedData(req, {
      locations: ["query"],
      includeOptionals: true,
    }) as {
      status?: "ACTIVE" | "ENDED";
      taxTreatment?: "PAYE" | "WHT" | "SELF_ASSESSMENT";
      year?: number;
    };
    const data = await employersService.list(userId, query);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Employers retrieved", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list employers", null));
  }
};

export const getEmployer = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const data = await employersService.getById(userId, paramId(req, "id"));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Employer retrieved", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get employer", null));
  }
};

export const updateEmployer = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    });
    const data = await employersService.update(
      userId,
      paramId(req, "id"),
      body as never,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Employer updated", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update employer", null));
  }
};

export const deleteEmployer = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    await employersService.remove(userId, paramId(req, "id"));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Employer deleted", null));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to delete employer", null));
  }
};

export const getEmployerIncomeHistory = async (
  req: IRequest,
  res: Response,
) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const query = matchedData(req, {
      locations: ["query"],
      includeOptionals: true,
    }) as { year?: number };
    const data = await employersService.getIncomeHistory(
      userId,
      paramId(req, "id"),
      query.year,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Income history retrieved", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get income history", null));
  }
};

export const createEmployerIncomeHistory = async (
  req: IRequest,
  res: Response,
) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    });
    const data = await employersService.createIncomeHistoryEntry(
      userId,
      paramId(req, "id"),
      body as never,
    );
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Income history recorded", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to record income history", null));
  }
};

export const listEmployerDocuments = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const query = matchedData(req, {
      locations: ["query"],
      includeOptionals: true,
    }) as { q?: string; status?: "MISSING" | "LINKED" };
    const data = await employersService.listDocuments(
      userId,
      paramId(req, "id"),
      query,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Documents retrieved", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list documents", null));
  }
};

export const linkEmployerDocument = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    });
    const data = await employersService.linkDocument(
      userId,
      paramId(req, "id"),
      body as never,
    );
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Document linked", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to link document", null));
  }
};

export const patchEmployerDocument = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    });
    const data = await employersService.patchDocument(
      userId,
      paramId(req, "id"),
      paramId(req, "documentId"),
      body as never,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Document updated", data));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update document", null));
  }
};

export const deleteEmployerDocument = async (req: IRequest, res: Response) => {
  try {
    ensureValid(req);
    const userId = getAuthUserId(req);
    await employersService.deleteDocument(
      userId,
      paramId(req, "id"),
      paramId(req, "documentId"),
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Document removed", null));
  } catch (error) {
    if (replyError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to remove document", null));
  }
};
