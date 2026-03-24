import { Response } from "express";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { IRequest } from "../interfaces/CustomRequest";
import { salesService } from "../mobile/services/salesService";
import { expensesService } from "../mobile/services/expensesService";
import { filingsService } from "../mobile/services/filingsService";
import { prisma } from "../config/database";
import { parseDateRangeQuery } from "../utils/dateRangeQuery";

const RECORD_TYPES = ["sales", "expenses", "filings"] as const;
type RecordType = (typeof RECORD_TYPES)[number];

function isValidRecordType(t: string): t is RecordType {
  return RECORD_TYPES.includes(t as RecordType);
}

/** GET /ai/records?type=sales|expenses|filings - Fetch records by type. Client ID from X-Client-Id header. */
export async function getRecords(
  req: IRequest,
  res: Response,
): Promise<void> {
  const clientId = req.aiClientId;
  if (!clientId) {
    res.status(HttpStatusCode.UNAUTHORIZED).json(
      outJson(false, "Missing client ID", null),
    );
    return;
  }

  const type = (req.query.type as string)?.toLowerCase();
  if (!type || !isValidRecordType(type)) {
    res.status(HttpStatusCode.BAD_REQUEST).json(
      outJson(false, `Invalid type. Must be one of: ${RECORD_TYPES.join(", ")}`, null),
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: clientId },
  });
  if (!user) {
    res.status(HttpStatusCode.NOT_FOUND).json(
      outJson(false, "Client not found", null),
    );
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page || 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 20), 10)));
  const sortOrder = req.query.sortOrder === "ASC" ? "ASC" : "DESC";

  const dr = parseDateRangeQuery(req.query as Record<string, unknown>);
  if (!dr.ok) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, dr.message, null));
    return;
  }

  try {
    let data: unknown;
    if (type === "sales") {
      const status = (req.query.status as string) || "all";
      data = await salesService.list(clientId, status, {
        page,
        limit,
        sortOrder,
        dateFrom: dr.range.dateFrom,
        dateTo: dr.range.dateTo,
      });
    } else if (type === "expenses") {
      data = await expensesService.list(clientId, {
        page,
        limit,
        sortOrder,
        dateFrom: dr.range.dateFrom,
        dateTo: dr.range.dateTo,
      });
    } else {
      data = await filingsService.list(
        clientId,
        {
          status: req.query.status as string | undefined,
          taxType: req.query.taxType as string | undefined,
        },
        {
          page,
          limit,
          sortOrder,
          dateFrom: dr.range.dateFrom,
          dateTo: dr.range.dateTo,
        },
      );
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Records retrieved", data));
  } catch (error) {
    console.error("AI getRecords error:", error);
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(
      outJson(false, "Failed to retrieve records", null),
    );
  }
}

/** PATCH /ai/records - Update a record. Body: { type, id, payload }. */
export async function updateRecord(
  req: IRequest,
  res: Response,
): Promise<void> {
  const clientId = req.aiClientId;
  if (!clientId) {
    res.status(HttpStatusCode.UNAUTHORIZED).json(
      outJson(false, "Missing client ID", null),
    );
    return;
  }

  const { type, id, payload } = req.body as {
    type?: string;
    id?: string;
    payload?: Record<string, unknown>;
  };

  if (!type || !id || !payload || typeof payload !== "object") {
    res.status(HttpStatusCode.BAD_REQUEST).json(
      outJson(false, "Body must include type, id, and payload", null),
    );
    return;
  }

  const recordType = type.toLowerCase();
  if (!isValidRecordType(recordType)) {
    res.status(HttpStatusCode.BAD_REQUEST).json(
      outJson(false, `Invalid type. Must be one of: ${RECORD_TYPES.join(", ")}`, null),
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: clientId },
  });
  if (!user) {
    res.status(HttpStatusCode.NOT_FOUND).json(
      outJson(false, "Client not found", null),
    );
    return;
  }

  try {
    let result: unknown;
    if (recordType === "sales") {
      result = await salesService.update(clientId, id, payload as Parameters<typeof salesService.update>[2]);
    } else if (recordType === "expenses") {
      result = await expensesService.update(clientId, id, payload as Parameters<typeof expensesService.update>[2]);
    } else {
      result = await filingsService.update(clientId, id, payload as Parameters<typeof filingsService.update>[2]);
    }

    if (!result) {
      res.status(HttpStatusCode.NOT_FOUND).json(
        outJson(false, "Record not found", null),
      );
      return;
    }

    res.status(HttpStatusCode.OK).json(outJson(true, "Record updated", result));
  } catch (error) {
    console.error("AI updateRecord error:", error);
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(
      outJson(false, "Failed to update record", null),
    );
  }
}
