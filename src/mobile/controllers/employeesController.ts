import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { employeesService } from "../services/employeesService";

export const listEmployees = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const data = await employeesService.list(userId);
    res.status(HttpStatusCode.OK).json(outJson(true, "Employees retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve employees", null));
  }
};

export const getEmployeeObligations = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const data = await employeesService.getObligations(userId);
    res.status(HttpStatusCode.OK).json(outJson(true, "Obligations retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve obligations", null));
  }
};

export const getEmployeeById = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Employee ID required", null));
      return;
    }
    const data = await employeesService.getById(userId, id);
    if (!data) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Employee not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Employee retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve employee", null));
  }
};

export const createEmployee = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
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
    } = req.body ?? {};
    if (!fullName || !jobTitle || !employmentType || basicSalary == null) {
      res.status(HttpStatusCode.BAD_REQUEST).json(
        outJson(false, "fullName, jobTitle, employmentType and basicSalary required", null)
      );
      return;
    }
    const data = await employeesService.create(userId, {
      fullName,
      jobTitle,
      employmentType,
      basicSalary: Number(basicSalary),
      housingAllowance: housingAllowance != null ? Number(housingAllowance) : undefined,
      transportAllowance: transportAllowance != null ? Number(transportAllowance) : undefined,
      mealAllowance: mealAllowance != null ? Number(mealAllowance) : undefined,
      otherAllowances: otherAllowances != null ? Number(otherAllowances) : undefined,
      stateOfResidence,
      startDate,
      tin,
      pensionRsa,
    });
    res.status(HttpStatusCode.OK).json(outJson(true, "Employee added", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add employee", null));
  }
};
