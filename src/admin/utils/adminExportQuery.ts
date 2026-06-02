import { Request } from "express";
import type { AdminListOpts } from "../services/adminListService";

/** List filters for export (no pagination cap from middleware). */
export function toAdminExportOpts(req: Request): Omit<AdminListOpts, "page" | "limit"> {
  const filters: Record<string, string | boolean | undefined> = {};
  for (const [key, val] of Object.entries(req.query)) {
    if (
      [
        "page",
        "limit",
        "search",
        "sortBy",
        "sortOrder",
        "dateFrom",
        "dateTo",
      ].includes(key)
    )
      continue;
    if (val !== undefined && val !== "") filters[key] = String(val);
  }

  const sortOrder =
    String(req.query.sortOrder ?? "DESC").toUpperCase() === "ASC" ? "asc" : "desc";

  return {
    search: req.query.search ? String(req.query.search) : undefined,
    sortBy: req.query.sortBy ? String(req.query.sortBy) : undefined,
    sortOrder,
    dateFrom: req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined,
    dateTo: req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined,
    filters,
  };
}
