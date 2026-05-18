import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { PaginationRequest } from "../../middlewares/paginationMiddleware";
import { RequestWithAdmin } from "../middlewares/adminAuthMiddleware";
import { adminAuthService } from "../services/adminAuthService";
import { adminDashboardService } from "../services/adminDashboardService";
import { adminListService } from "../services/adminListService";
import { toAdminListOpts } from "../utils/adminListQuery";

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
