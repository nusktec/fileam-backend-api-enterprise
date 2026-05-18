import { Request } from "express";
import { PaginationRequest } from "../../middlewares/paginationMiddleware";
import type { AdminListOpts } from "../services/adminListService";

export function toAdminListOpts(req: PaginationRequest): AdminListOpts {
  const p = req.pagination!;
  const filters: Record<string, string | boolean | undefined> = {};
  for (const [key, val] of Object.entries(req.query)) {
    if (
      ["page", "limit", "search", "sortBy", "sortOrder", "dateFrom", "dateTo"].includes(
        key,
      )
    )
      continue;
    if (val !== undefined && val !== "") filters[key] = String(val);
  }
  return {
    page: p.page,
    limit: Math.min(p.limit, 200),
    search: p.search,
    sortBy: p.sortBy,
    sortOrder: p.sortOrder === "ASC" ? "asc" : "desc",
    dateFrom: p.dateFrom,
    dateTo: p.dateTo,
    filters,
  };
}
