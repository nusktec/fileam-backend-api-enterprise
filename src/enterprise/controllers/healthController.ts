import { Request, Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";

export const health = async (req: Request, res: Response): Promise<void> => {
  res.status(HttpStatusCode.OK).json(outJson(true, "Enterprise API", { status: "ok" }));
};
