import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { PaginationRequest } from "../../middlewares/paginationMiddleware";
import { RequestWithAdmin } from "../middlewares/adminAuthMiddleware";
import { adminAuthService } from "../services/adminAuthService";
import { adminDashboardService } from "../services/adminDashboardService";
import { adminExportService } from "../services/adminExportService";
import { adminListService } from "../services/adminListService";
import { toAdminExportOpts } from "../utils/adminExportQuery";
import { toAdminListOpts } from "../utils/adminListQuery";

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(HttpStatusCode.OK).send("\uFEFF" + csv);
}

export async function adminLogin(req: RequestWithAdmin, res: Response) {
  const { email, password } = matchedData(req, { locations: ["body"] }) as {
    email: string;
    password: string;
  };
  const result = await adminAuthService.login(email, password);
  if (!result.success) {
    res
      .status(HttpStatusCode.UNAUTHORIZED)
      .json(outJson(false, result.message, null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Login successful", result.data));
}

export async function adminMe(req: RequestWithAdmin, res: Response) {
  const admin = await adminAuthService.getMe(req.admin!.id);
  if (!admin) {
    res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Not found", null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "Admin profile", admin));
}

export async function adminMetrics(_req: RequestWithAdmin, res: Response) {
  const data = await adminDashboardService.getMetrics();
  res.status(HttpStatusCode.OK).json(outJson(true, "Dashboard metrics", data));
}

export async function adminCharts(req: RequestWithAdmin, res: Response) {
  const months = req.query.months ? Number(req.query.months) : 12;
  const data = await adminDashboardService.getCharts(
    Number.isFinite(months) ? months : 12,
  );
  res.status(HttpStatusCode.OK).json(outJson(true, "Dashboard charts", data));
}

export async function adminListUsers(req: PaginationRequest, res: Response) {
  const data = await adminListService.listUsers(toAdminListOpts(req));
  res.status(HttpStatusCode.OK).json(outJson(true, "Users", data));
}

export async function adminGetUser(req: RequestWithAdmin, res: Response) {
  const id = String(req.params.id);
  const data = await adminListService.getUser(id);
  if (!data) {
    res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "User not found", null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "User", data));
}

export async function adminPatchUser(req: RequestWithAdmin, res: Response) {
  const id = String(req.params.id);
  const body = req.body as { verified?: boolean; requestDelete?: boolean };
  const data = await adminListService.patchUser(id, body);
  res.status(HttpStatusCode.OK).json(outJson(true, "User updated", data));
}

export async function adminListCompanies(
  req: PaginationRequest,
  res: Response,
) {
  const data = await adminListService.listCompanies(toAdminListOpts(req));
  res.status(HttpStatusCode.OK).json(outJson(true, "Companies", data));
}

export async function adminListSales(req: PaginationRequest, res: Response) {
  const data = await adminListService.listSales(toAdminListOpts(req));
  res.status(HttpStatusCode.OK).json(outJson(true, "Sales", data));
}

export async function adminListExpenses(
  req: PaginationRequest,
  res: Response,
) {
  const data = await adminListService.listExpenses(toAdminListOpts(req));
  res.status(HttpStatusCode.OK).json(outJson(true, "Expenses", data));
}

export async function adminListTaxPayables(
  req: PaginationRequest,
  res: Response,
) {
  const data = await adminListService.listTaxPayables(toAdminListOpts(req));
  res.status(HttpStatusCode.OK).json(outJson(true, "Tax payables", data));
}

export async function adminListInvitations(
  req: PaginationRequest,
  res: Response,
) {
  const data = await adminListService.listInvitations(toAdminListOpts(req));
  res.status(HttpStatusCode.OK).json(outJson(true, "Invitations", data));
}

export async function adminListConsultantOnboarding(
  req: PaginationRequest,
  res: Response,
) {
  const data = await adminListService.listConsultantOnboarding(
    toAdminListOpts(req),
  );
  res
    .status(HttpStatusCode.OK)
    .json(outJson(true, "Consultant onboarding sessions", data));
}

export async function adminExportUsers(req: RequestWithAdmin, res: Response) {
  const csv = await adminExportService.exportUsers(toAdminExportOpts(req));
  sendCsv(res, "users.csv", csv);
}

export async function adminExportCompanies(req: RequestWithAdmin, res: Response) {
  const csv = await adminExportService.exportCompanies(toAdminExportOpts(req));
  sendCsv(res, "companies.csv", csv);
}

export async function adminExportSales(req: RequestWithAdmin, res: Response) {
  const csv = await adminExportService.exportSales(toAdminExportOpts(req));
  sendCsv(res, "sales.csv", csv);
}

export async function adminExportExpenses(req: RequestWithAdmin, res: Response) {
  const csv = await adminExportService.exportExpenses(toAdminExportOpts(req));
  sendCsv(res, "expenses.csv", csv);
}

export async function adminExportTaxPayables(
  req: RequestWithAdmin,
  res: Response,
) {
  const csv = await adminExportService.exportTaxPayables(toAdminExportOpts(req));
  sendCsv(res, "tax-payables.csv", csv);
}

export async function adminExportInvitations(req: RequestWithAdmin, res: Response) {
  const csv = await adminExportService.exportInvitations(toAdminExportOpts(req));
  sendCsv(res, "invitations.csv", csv);
}

export async function adminExportConsultantOnboarding(
  req: RequestWithAdmin,
  res: Response,
) {
  const csv = await adminExportService.exportConsultantOnboarding(
    toAdminExportOpts(req),
  );
  sendCsv(res, "consultant-onboarding.csv", csv);
}

export async function adminExportMetrics(_req: RequestWithAdmin, res: Response) {
  const csv = await adminExportService.exportMetricsSummary();
  sendCsv(res, "admin-metrics.csv", csv);
}
