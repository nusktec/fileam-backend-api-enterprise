import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { assertConsultantClientAccess } from "../../utils/consultantClientAccess";
import { submitUnifiedTaxFilingForUser } from "../services/unifiedTaxFilingSubmitService";

function normalizeTaxType(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return String(v ?? "").trim().toUpperCase();
}

/**
 * Consultant submits a filing for a linked client. Requires `clientApprovalConfirmed: true`
 * in the body (client consent captured in the app). Senior-consultant rules can be layered later.
 */
export async function submitConsultantTaxFilingForClient(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const consultantId = getAuthUserId(req);
    const clientUserId = Array.isArray(req.params.clientUserId)
      ? req.params.clientUserId[0]
      : req.params.clientUserId;
    const taxType = normalizeTaxType(req.params.taxType);
    const body = req.body ?? {};
    if (body.clientApprovalConfirmed !== true) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(
            false,
            "clientApprovalConfirmed must be true (client approved filing on their behalf)",
            null,
          ),
        );
      return;
    }
    const ok = await assertConsultantClientAccess(consultantId, clientUserId!);
    if (!ok) {
      res
        .status(HttpStatusCode.FORBIDDEN)
        .json(outJson(false, "No active consultant link for this client", null));
      return;
    }
    const result = await submitUnifiedTaxFilingForUser(
      clientUserId!,
      taxType,
      body,
    );
    if (!result.ok) {
      res
        .status(result.status)
        .json(outJson(false, result.message, null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(
        outJson(true, "Filing submitted for client", {
          taxType: result.taxType,
          data: result.data,
          filedForUserId: clientUserId,
        }),
      );
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to submit filing for client", null));
  }
}
