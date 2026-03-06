import { Request, Response, NextFunction } from "express";
import { outJson } from "../utils/renders";
import { validationResult } from "express-validator";

interface AppError extends Error {
  statusCode?: number;
}

const HTTP_INTERNAL_SERVER_ERROR = 500;
const SERVER_ERROR_MESSAGE = "An unexpected error occurred. Please try again later.";

/** Prisma errors have a string code starting with "P" (e.g. P2022). */
function isPrismaError(err: unknown): err is { code: string; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: string }).code === "string" &&
    (err as { code: string }).code.startsWith("P")
  );
}

function handleErrorResponse(
  err: unknown,
  req: Request,
  res: Response,
  statusCode: number,
  message: string,
) {
  if (isPrismaError(err)) {
    console.error("Prisma/database error:", err.code, err.message);
    res.status(HTTP_INTERNAL_SERVER_ERROR).json(outJson(false, SERVER_ERROR_MESSAGE, null));
    return;
  }
  const appErr = err as AppError;
  const code = appErr?.statusCode ?? statusCode;
  const msg = appErr?.message || message;
  if (code >= 500) console.error("Server error:", msg);
  res.status(code).json(outJson(false, msg, null));
}

const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) return next(err);
  handleErrorResponse(err, req, res, 500, "Internal Server Error");
};

const catchError = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) return next(err);
  const appErr = err as AppError;
  handleErrorResponse(err, req, res, appErr?.statusCode ?? 500, "Internal Server Error");
};

const error404 = (req: Request, res: Response, next: NextFunction) => {
  res.status(404).json(outJson(false, "Resource not found", null));
};

const handleValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json(
      outJson(false, `Validation error. '${errors.array()[0].msg}'`, {
        errors: errors.array(),
      }),
    );
    return;
  }
  next();
};
export { errorHandler, catchError, error404, handleValidation };
