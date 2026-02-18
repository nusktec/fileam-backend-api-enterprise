/**
 Author: Aka'aba Musa Akidi
 Engine: Stack
 Git: kingakidi
 **/

import { Request, Response, NextFunction } from "express";
import process from "process";
import { outJson } from "../utils/renders";
import { check, param, query, validationResult } from "express-validator";

// Custom error interface
interface AppError extends Error {
  statusCode?: number;
}

// Centralized error handling middleware
const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("Error:", err.message);

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res
    .status(statusCode)
    .json(
      outJson(false, message, [
        process.env.NODE_ENV === "production" ? null : err.stack,
      ])
    );
};

const catchError = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res
    .status(statusCode)
    .json(
      outJson(false, message, [
        process.env.NODE_ENV === "production" ? null : err.stack,
      ])
    );
};

// Catch-all route for handling 404 Not Found
const error404 = (req: Request, res: Response, next: NextFunction) => {
  res.status(404).json(outJson(false, "Resource not found", null));
};

//Centralize Middleware to handle validation result
const handleValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json(
      outJson(false, `Validation error. '${errors.array()[0].msg}'`, {
        errors: errors.array(),
      })
    );
    return;
  }
  next();
};
export { errorHandler, catchError, error404, handleValidation };
