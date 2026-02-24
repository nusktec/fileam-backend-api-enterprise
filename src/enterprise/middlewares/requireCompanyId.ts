import { NextFunction, Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";

export function requireCompanyId(
  req: IRequest,
  _res: Response,
  next: NextFunction,
): void {
  req.companyId = req.params.companyId as string;
  next();
}
