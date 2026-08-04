import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { employeesService } from "../services/employeesService";

export const listEmployees = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const pagination = req.pagination;
    const data = await employeesService.list(userId, {
      page: pagination?.page,
      limit: pagination?.limit,
      sortOrder: pagination?.sortOrder,
      dateFrom: pagination?.dateFrom,
      dateTo: pagination?.dateTo,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Employees retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve employees", null));
  }
};

export const getEmployeeObligations = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await employeesService.getObligations(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Obligations retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve obligations", null));
  }
};

export const getEmployeeById = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await employeesService.getById(userId, id!);
    if (!data) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Employee not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Employee retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve employee", null));
  }
};

export const createEmployee = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const {
      fullName,
      jobTitle,
      employmentType,
      basicSalary,
      housingAllowance,
      transportAllowance,
      mealAllowance,
      otherAllowances,
      stateOfResidence,
      startDate,
      tin,
      pensionRsa,
      pfa,
    } = req.body ?? {};
    const data = await employeesService.create(userId, {
      fullName,
      jobTitle,
      employmentType,
      basicSalary: Number(basicSalary),
      housingAllowance:
        housingAllowance != null ? Number(housingAllowance) : undefined,
      transportAllowance:
        transportAllowance != null ? Number(transportAllowance) : undefined,
      mealAllowance: mealAllowance != null ? Number(mealAllowance) : undefined,
      otherAllowances:
        otherAllowances != null ? Number(otherAllowances) : undefined,
      stateOfResidence,
      startDate,
      tin,
      pensionRsa,
      pfa,
    });
    res.status(HttpStatusCode.OK).json(outJson(true, "Employee added", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add employee", null));
  }
};

export const updateEmployee = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = req.body ?? {};
    const keys = Object.keys(body).filter((k) => body[k] !== undefined);
    if (keys.length === 0) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Provide at least one field to update", null));
      return;
    }
    const data = await employeesService.update(userId, id!, {
      fullName: body.fullName,
      jobTitle: body.jobTitle,
      employmentType: body.employmentType,
      basicSalary:
        body.basicSalary != null ? Number(body.basicSalary) : undefined,
      housingAllowance:
        body.housingAllowance != null ? Number(body.housingAllowance) : undefined,
      transportAllowance:
        body.transportAllowance != null
          ? Number(body.transportAllowance)
          : undefined,
      mealAllowance:
        body.mealAllowance != null ? Number(body.mealAllowance) : undefined,
      otherAllowances:
        body.otherAllowances != null ? Number(body.otherAllowances) : undefined,
      stateOfResidence: body.stateOfResidence,
      startDate: body.startDate,
      tin: body.tin,
      pensionRsa: body.pensionRsa,
      pfa: body.pfa,
    });
    if (!data) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Employee not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Employee updated", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update employee", null));
  }
};

export const deleteEmployee = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const ok = await employeesService.deleteForUser(userId, id!);
    if (!ok) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Employee not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Employee deleted", null));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to delete employee", null));
  }
};

export const fileEmployeeAsExpense = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const expense = await employeesService.fileAsExpense(userId, id!);
    if (!expense) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Employee not found", null));
      return;
    }
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Employee filed as expense", expense));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to file employee as expense", null));
  }
};
