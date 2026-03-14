import express from "express";
import {
  inviteTeamMember,
  listTeamInvitations,
  getTeamInvitationByCode,
  acceptTeamInvitation,
  listTeamMembers,
} from "../controllers/teamManagementController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireEnterpriseOnboardingComplete } from "../middlewares/requireEnterpriseOnboardingComplete";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";

const router = express.Router();

router.post(
  "/invitations",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  enterpriseValidations.validateInviteTeamMember,
  inviteTeamMember,
);
router.get(
  "/invitations",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  listTeamInvitations,
);
router.get(
  "/invitations/accept",
  getTeamInvitationByCode,
);
router.post(
  "/invitations/accept",
  express.json(),
  enterpriseValidations.validateAcceptTeamInvitation,
  acceptTeamInvitation,
);
router.get(
  "/members",
  authenticate(),
  requireEnterpriseOnboardingComplete,
  listTeamMembers,
);

export default router;
