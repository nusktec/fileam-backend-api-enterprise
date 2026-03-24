import { Request, Response, NextFunction } from "express";
import { HttpStatusCode } from "../interfaces/system";
import { outJson } from "../utils/renders";
import { parseDateRangeQuery } from "../utils/dateRangeQuery";

export interface PaginationQuery {
  page?: string;
  limit?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginationRequest extends Request {
  pagination?: {
    page: number;
    limit: number;
    search?: string;
    sortBy?: string;
    sortOrder: "ASC" | "DESC";
    dateFrom?: Date;
    dateTo?: Date;
  };
}

export const validatePaginationParams = (
  req: PaginationRequest,
  res: Response,
  next: NextFunction,
): void => {
  const { page, limit, sortOrder } = req.query as PaginationQuery;

  // Validate page
  const pageNum = Number(page);
  if (page && (isNaN(pageNum) || pageNum < 1)) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Page must be a positive number", null));
    return;
  }

  // Validate limit
  const limitNum = Number(limit);
  if (limit && (isNaN(limitNum) || limitNum < 1 || limitNum > 100)) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Limit must be between 1 and 100", null));
    return;
  }

  // Validate sortOrder
  if (sortOrder && !["ASC", "DESC"].includes(sortOrder.toUpperCase())) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Sort order must be either 'ASC' or 'DESC'", null));
    return;
  }

  const dr = parseDateRangeQuery(req.query as Record<string, unknown>);
  if (!dr.ok) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, dr.message, null));
    return;
  }

  // Set default pagination parameters
  req.pagination = {
    page: pageNum || 1,
    limit: limitNum || 10,
    search: req.query.search as string,
    sortBy: req.query.sortBy as string,
    sortOrder: (sortOrder?.toUpperCase() as "ASC" | "DESC") || "DESC",
    ...(dr.range.dateFrom || dr.range.dateTo
      ? { dateFrom: dr.range.dateFrom, dateTo: dr.range.dateTo }
      : {}),
  };

  next();
};

/**
 * Single source of pagination middleware. Use on list routes to validate
 * page, limit, sortOrder and set req.pagination. Optionally pass defaultSortBy.
 */
export const withPagination = (defaultSortBy?: string) => {
  return (req: PaginationRequest, res: Response, next: NextFunction) => {
    validatePaginationParams(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (defaultSortBy && req.pagination && !req.pagination.sortBy) {
        req.pagination.sortBy = defaultSortBy;
      }
      next();
    });
  };
};
