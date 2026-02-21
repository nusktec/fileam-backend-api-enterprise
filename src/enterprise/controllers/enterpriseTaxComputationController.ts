import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { enterpriseTaxComputationService } from "../services/enterpriseTaxComputationService";

export async function getVatStatus(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const status = await enterpriseTaxComputationService.getVatStatus(companyId);
    if (!status) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "VAT status", status));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get VAT status", null));
  }
}

export async function initiateVatSetup(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const result = await enterpriseTaxComputationService.initiateVatSetup(companyId);
    if (!result) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.CREATED).json(outJson(true, "VAT setup initiated", result));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to initiate VAT setup", null));
  }
}

export async function getVatTypes(_req: IRequest, res: Response): Promise<void> {
  try {
    const types = enterpriseTaxComputationService.getVatTypes();
    res.status(HttpStatusCode.OK).json(outJson(true, "VAT types", types));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get VAT types", null));
  }
}

export async function getVatPeriods(_req: IRequest, res: Response): Promise<void> {
  try {
    const periods = enterpriseTaxComputationService.getVatPeriods();
    res.status(HttpStatusCode.OK).json(outJson(true, "VAT periods", periods));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get VAT periods", null));
  }
}

export async function calculateVat(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const body = req.body || {};
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  const vatType = body.vatType != null ? String(body.vatType).trim() : "";
  const vatPeriod = body.vatPeriod != null ? String(body.vatPeriod).trim() : "";
  const startDate = body.startDate ? new Date(body.startDate) : null;
  const endDate = body.endDate ? new Date(body.endDate) : null;
  const salesAmountExclVat = Number(body.salesAmountExclVat ?? body.salesAmount ?? 0);
  const purchaseAmountExclVat = Number(body.purchaseAmountExclVat ?? body.purchaseAmount ?? 0);
  const vatRate = Number(body.vatRate ?? 15);
  if (!vatType || !vatPeriod || !startDate || !endDate || (isNaN(salesAmountExclVat) && isNaN(purchaseAmountExclVat))) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "vatType, vatPeriod, startDate, endDate, and at least one of salesAmountExclVat or purchaseAmountExclVat required", null));
    return;
  }
  try {
    const result = await enterpriseTaxComputationService.calculateVat(companyId, {
      vatType,
      vatPeriod,
      startDate,
      endDate,
      salesAmountExclVat: salesAmountExclVat || 0,
      purchaseAmountExclVat: purchaseAmountExclVat || 0,
      vatRate,
    });
    if (!result) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.CREATED).json(outJson(true, "VAT calculated", {
      salesVat: result.salesVat,
      purchaseVat: result.purchaseVat,
      netVatPayable: result.netVatPayable,
      computationId: result.computation.id,
    }));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to calculate VAT", null));
  }
}

export async function getVatResults(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const computationId = req.query.computationId as string | undefined;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const result = await enterpriseTaxComputationService.getVatResults(companyId, computationId);
    if (!result) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "No VAT results or company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "VAT results", result));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get VAT results", null));
  }
}

export async function downloadVatReport(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const computationId = req.query.computationId as string | undefined;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const result = await enterpriseTaxComputationService.getVatResults(companyId, computationId);
    if (!result) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "No VAT results to download", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Report URL (stub)", {
      downloadUrl: `/api/v1/enterprise/company/${companyId}/vat-computation/report.pdf?computationId=${result.computation.id}`,
      ...result,
    }));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to generate report", null));
  }
}

export async function submitVatReturn(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const computationId = req.body?.computationId ?? req.params.computationId;
  if (!companyId || !computationId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId and computationId required", null));
    return;
  }
  try {
    const result = await enterpriseTaxComputationService.submitVatReturn(companyId, computationId);
    if (!result) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Computation not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "VAT return submitted", result));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to submit VAT return", null));
  }
}

export async function getMonthlyVatPayable(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  const year = req.query.year ? Number(req.query.year) : undefined;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const data = await enterpriseTaxComputationService.getMonthlyVatPayable(companyId, year);
    if (!data) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Monthly VAT payable", data));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get monthly VAT", null));
  }
}

export async function getThresholdStatus(req: IRequest, res: Response): Promise<void> {
  const companyId = req.params.companyId;
  if (!companyId) {
    res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "companyId required", null));
    return;
  }
  try {
    const status = await enterpriseTaxComputationService.getThresholdStatus(companyId);
    if (!status) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Company not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Threshold status", status));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get threshold status", null));
  }
}

export async function getThresholdInfo(_req: IRequest, res: Response): Promise<void> {
  try {
    const info = await enterpriseTaxComputationService.getThresholdInfo();
    res.status(HttpStatusCode.OK).json(outJson(true, "Threshold info", info));
  } catch (e) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(outJson(false, "Failed to get threshold info", null));
  }
}
