import express from "express";
import {
  listEmployees,
  getEmployeeObligations,
  getEmployeeById,
  createEmployee,
} from "../controllers/employeesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/obligations", getEmployeeObligations);
router.get("/", listEmployees);
router.get("/:id", getEmployeeById);
router.post("/", express.json(), createEmployee);

export default router;
