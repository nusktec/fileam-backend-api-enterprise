import "./config/env";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import logger from "morgan";
import express from "express";
import http from "http";
import { prisma } from "./config/database";
import mobileRoutes from "./mobile/routes";
import enterpriseRoutes from "./enterprise/routes";

import * as process from "process";
import { catchError, error404, errorHandler } from "./middlewares/errorHandler";

import { runSeed } from "./seed/seed";

const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

const getAllowedOriginsSet = (): Set<string> => {
  const allowedOrigins =
    process.env.ALLOWED_ORIGINS ||
    process.env.BASE_URL ||
    "http://localhost:3000";

  const fromEnv = allowedOrigins
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  const devOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://172.26.32.1:3000",
    "https://85b8-102-91-99-118.ngrok-free.app",
  ];

  return new Set([...fromEnv, ...devOrigins]);
};

const allowedOriginsSet = getAllowedOriginsSet();

const corsOrigin = (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
) => {
  if (!origin) return cb(null, true);
  if (allowedOriginsSet.has(origin)) return cb(null, true);
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return cb(null, true);
  if (/^https?:\/\/172\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin))
    return cb(null, true);
  if (/^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin))
    return cb(null, true);
  console.log(`CORS blocked origin: ${origin}`);
  cb(new Error("Not allowed by CORS"));
};

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
    maxAge: 86400,
  }),
);

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const API_VERSION = process.env.API_VERSION || "1";

app.use(`/api/v${API_VERSION}/mobile`, mobileRoutes);
app.use(`/api/v${API_VERSION}/enterprise`, enterpriseRoutes);

app.use(error404);
app.use(catchError);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log("Database connection established successfully.");

    const shouldSeed =
      process.argv.includes("--seed") || process.env.RUN_SEED !== "false";
    if (shouldSeed) {
      console.log("Running database seed...");
      await runSeed();
    }

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Allowed origins:`, Array.from(allowedOriginsSet));
    });
  } catch (error) {
    console.error("Error starting server:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

startServer();
