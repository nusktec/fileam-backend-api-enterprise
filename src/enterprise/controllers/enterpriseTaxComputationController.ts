import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { getParam } from "../utils/paramHelpers";
import {
  requireCompanyId,
  sendNotFound,
  sendResult,
  sendCreated,
  sendServerError,
} from "../utils/controllerHelpers";
import { enterpriseTaxComputationService } from "../services/enterpriseTaxComputationService";

export async function getVatStatus(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  try {
    const status =
      await enterpriseTaxComputationService.getVatStatus(companyId);
    if (!status) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "VAT status", status);
  } catch {
    sendServerError(res, "Failed to get VAT status");
  }
}

export async function initiateVatSetup(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  try {
    const result =
      await enterpriseTaxComputationService.initiateVatSetup(companyId);
    if (!result) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendCreated(res, "VAT setup initiated", result);
  } catch {
    sendServerError(res, "Failed to initiate VAT setup");
  }
}

export async function getVatTypes(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const types = enterpriseTaxComputationService.getVatTypes();
    sendResult(res, "VAT types", types);
  } catch {
    sendServerError(res, "Failed to get VAT types");
  }
}

export async function getVatPeriods(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const periods = enterpriseTaxComputationService.getVatPeriods();
    sendResult(res, "VAT periods", periods);
  } catch {
    sendServerError(res, "Failed to get VAT periods");
  }
}

export async function calculateVat(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const body = req.body || {};
  const vatType = body.vatType != null ? String(body.vatType).trim() : "";
  const vatPeriod = body.vatPeriod != null ? String(body.vatPeriod).trim() : "";
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  const salesAmountExclVat = Number(
    body.salesAmountExclVat ?? body.salesAmount ?? 0,
  );
  const purchaseAmountExclVat = Number(
    body.purchaseAmountExclVat ?? body.purchaseAmount ?? 0,
  );
  const vatRate = Number(body.vatRate ?? 15);
  try {
    const result = await enterpriseTaxComputationService.calculateVat(
      companyId,
      {
        vatType,
        vatPeriod,
        startDate,
        endDate,
        salesAmountExclVat: salesAmountExclVat || 0,
        purchaseAmountExclVat: purchaseAmountExclVat || 0,
        vatRate,
      },
    );
    if (!result) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendCreated(res, "VAT calculated", {
      salesVat: result.salesVat,
      purchaseVat: result.purchaseVat,
      netVatPayable: result.netVatPayable,
      computationId: result.computation.id,
    });
  } catch {
    sendServerError(res, "Failed to calculate VAT");
  }
}

export async function getVatResults(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const computationId =
    (req.query.computationId as string | undefined) ?? undefined;
  try {
    const result = await enterpriseTaxComputationService.getVatResults(
      companyId,
      computationId,
    );
    if (!result) {
      sendNotFound(res, "No VAT results or company not found");
      return;
    }
    sendResult(res, "VAT results", result);
  } catch {
    sendServerError(res, "Failed to get VAT results");
  }
}

export async function downloadVatReport(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const computationId =
    (req.query.computationId as string | undefined) ?? undefined;
  try {
    const result = await enterpriseTaxComputationService.getVatResults(
      companyId,
      computationId,
    );
    if (!result) {
      sendNotFound(res, "No VAT results to download");
      return;
    }
    sendResult(res, "Report URL (stub)", {
      downloadUrl: `/api/v1/enterprise/company/${companyId}/vat-computation/report.pdf?computationId=${result.computation.id}`,
      ...result,
    });
  } catch {
    sendServerError(res, "Failed to generate report");
  }
}

export async function submitVatReturn(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const computationId =
    getParam(req.params, "computationId") ||
    (req.body?.computationId != null ? String(req.body.computationId) : "");
  try {
    const result = await enterpriseTaxComputationService.submitVatReturn(
      companyId,
      computationId,
    );
    if (!result) {
      sendNotFound(res, "Computation not found");
      return;
    }
    sendResult(res, "VAT return submitted", result);
  } catch {
    sendServerError(res, "Failed to submit VAT return");
  }
}

export async function getMonthlyVatPayable(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  const year = req.query.year ? Number(req.query.year) : undefined;
  try {
    const data = await enterpriseTaxComputationService.getMonthlyVatPayable(
      companyId,
      year,
    );
    if (!data) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Monthly VAT payable", data);
  } catch {
    sendServerError(res, "Failed to get monthly VAT");
  }
}

export async function getThresholdStatus(
  req: IRequest,
  res: Response,
): Promise<void> {
  const companyId = requireCompanyId(req, res);
  if (companyId === null) return;
  try {
    const status =
      await enterpriseTaxComputationService.getThresholdStatus(companyId);
    if (!status) {
      sendNotFound(res, "Company not found");
      return;
    }
    sendResult(res, "Threshold status", status);
  } catch {
    sendServerError(res, "Failed to get threshold status");
  }
}

export async function getThresholdInfo(
  _req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const info = await enterpriseTaxComputationService.getThresholdInfo();
    sendResult(res, "Threshold info", info);
  } catch {
    sendServerError(res, "Failed to get threshold info");
  }
}
