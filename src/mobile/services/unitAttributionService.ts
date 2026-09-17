import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { ASSET_STATUS, isAssetOnBooks } from "../../constants/assets";
import { computeAssetDepreciation } from "../../constants/assetDepreciation";
import {
  isUndoneStatus,
  mapUndoPayload,
  RECORD_UNDO_STATUS,
} from "../../constants/recordUndo";
import {
  PRODUCTION_RECORD_STATUS,
  type UnitAttributionPeriodType,
} from "../../constants/unitAttribution";
import { ledgerPostingService } from "../../services/ledgerPostingService";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import {
  buildPeriodLabel,
  derivePeriodEnd,
  formatPeriodYmd,
  generateOpenPeriodsAfter,
  generateOpenPeriodsFrom,
  parsePeriodStartInput,
  resolveInitialOpenPeriodStart,
  validatePeriodStart,
  type SchedulePeriod,
} from "../../utils/unitAttributionPeriods";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

function dec(n: number): Decimal {
  return new Decimal(normalizeMoneyAmount(n));
}

function assertEligibleAsset(asset: {
  id: string;
  depreciationMethod: string | null;
  status: string;
}) {
  const method = asset.depreciationMethod;
  if (method !== "UNIT_OF_PRODUCTION" && method !== "UNITS_OF_PRODUCTION") {
    throw new HttpReplyError(
      400,
      "Asset must use UNIT_OF_PRODUCTION depreciation",
    );
  }
  if (asset.status === ASSET_STATUS.SOLD || asset.status === ASSET_STATUS.DISPOSED) {
    throw new HttpReplyError(400, "Asset is sold or disposed");
  }
  if (!isAssetOnBooks(asset.status) || asset.status !== ASSET_STATUS.ACTIVE) {
    throw new HttpReplyError(400, "Asset must be ACTIVE");
  }
}

function computeTotals(asset: {
  purchaseCost: Decimal;
  residualValue: Decimal | null;
  totalEstimatedUnit: Decimal | null;
  unitProduced: Decimal | null;
  purchaseDate: Date;
  depreciationMethod: string | null;
}, recordedUnits: number) {
  const purchaseCost = d(asset.purchaseCost);
  const residualValue = d(asset.residualValue);
  const totalEstimatedUnit = d(asset.totalEstimatedUnit);
  const depreciableAmount = normalizeMoneyAmount(
    Math.max(0, purchaseCost - residualValue),
  );
  const depreciationPerUnit =
    totalEstimatedUnit > 0
      ? normalizeMoneyAmount(depreciableAmount / totalEstimatedUnit)
      : 0;
  const recordedCharge = normalizeMoneyAmount(
    recordedUnits * depreciationPerUnit,
  );

  const depreciation = computeAssetDepreciation({
    purchaseCost,
    purchaseDate: asset.purchaseDate,
    depreciationMethod: "UNIT_OF_PRODUCTION",
    residualValue,
    totalEstimatedUnit,
    unitProduced: recordedUnits,
  });

  return {
    recordedUnits,
    depreciableAmount,
    depreciationPerUnit,
    recordedCharge,
    accumulatedDepreciation: depreciation.accumulatedDepreciation,
    bookValue: depreciation.bookValue,
  };
}

function mapAssetNested(asset: {
  id: string;
  assetName: string;
  assetCode: string;
  assetType: string;
  status: string;
  purchaseDate: Date;
  purchaseCost: Decimal;
  residualValue: Decimal | null;
  totalEstimatedUnit: Decimal | null;
  unitProduced: Decimal | null;
  depreciationMethod: string | null;
}, depreciationPerUnit: number) {
  return {
    id: asset.id,
    assetName: asset.assetName,
    assetCode: asset.assetCode,
    assetType: asset.assetType,
    status: asset.status,
    purchaseDate: formatPeriodYmd(asset.purchaseDate),
    purchaseCost: d(asset.purchaseCost),
    residualValue: d(asset.residualValue),
    totalEstimatedUnit: d(asset.totalEstimatedUnit),
    depreciationMethod: "UNIT_OF_PRODUCTION",
    depreciationPerUnit,
    unitProduced: d(asset.unitProduced),
  };
}

async function buildSchedule(
  periodType: UnitAttributionPeriodType,
  attributionId: string,
  depreciationPerUnit: number,
  attributionCreatedAt: Date,
): Promise<SchedulePeriod[]> {
  const records = await prisma.unitAttributionProductionRecord.findMany({
    where: { unitAttributionId: attributionId },
    orderBy: { periodStart: "asc" },
  });

  const persisted: SchedulePeriod[] = records.map((r) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    periodStart: formatPeriodYmd(r.periodStart),
    periodEnd: formatPeriodYmd(r.periodEnd),
    units: r.unitsAttributed,
    status: r.status,
    depreciationAmount: normalizeMoneyAmount(
      r.unitsAttributed * depreciationPerUnit,
    ),
    rate: depreciationPerUnit,
    undo: mapUndoPayload(r),
  }));

  const liveRecorded = records.filter(
    (r) => r.status === PRODUCTION_RECORD_STATUS.RECORDED,
  );

  const open =
    liveRecorded.length > 0
      ? generateOpenPeriodsAfter(
          periodType,
          liveRecorded[liveRecorded.length - 1]!.periodEnd,
          4,
          depreciationPerUnit,
        ).map((p) => ({ ...p, undo: null }))
      : generateOpenPeriodsFrom(
          periodType,
          resolveInitialOpenPeriodStart(periodType, attributionCreatedAt),
          4,
          depreciationPerUnit,
        ).map((p) => ({ ...p, undo: null }));

  return [...persisted, ...open];
}

function mapListItem(
  row: Awaited<ReturnType<typeof prisma.unitAttribution.findMany>>[number] & {
    asset: {
      id: string;
      assetName: string;
      assetCode: string;
      assetType: string;
      status: string;
    };
  },
) {
  return {
    id: row.id,
    productName: row.productName,
    brandName: row.brandName,
    skuCode: row.skuCode,
    unitOfMeasurement: row.unitOfMeasurement,
    periodType: row.periodType,
    status: row.status,
    undo: mapUndoPayload(row),
    asset: {
      id: row.asset.id,
      assetName: row.asset.assetName,
      assetCode: row.asset.assetCode,
      assetType: row.asset.assetType,
      status: row.asset.status,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function buildDetail(userId: string, id: string) {
  const row = await prisma.unitAttribution.findFirst({
    where: { id, userId },
    include: { asset: true, records: true },
  });
  if (!row) throw new HttpReplyError(404, "Unit attribution not found");

  const recordedUnits = row.records
    .filter((r) => r.status === PRODUCTION_RECORD_STATUS.RECORDED)
    .reduce((s, r) => s + r.unitsAttributed, 0);

  const totals = computeTotals(row.asset, recordedUnits);
  const schedule = await buildSchedule(
    row.periodType as UnitAttributionPeriodType,
    row.id,
    totals.depreciationPerUnit,
    row.createdAt,
  );

  return {
    id: row.id,
    assetId: row.assetId,
    productName: row.productName,
    brandName: row.brandName,
    skuCode: row.skuCode,
    description: row.description,
    unitOfMeasurement: row.unitOfMeasurement,
    periodType: row.periodType,
    administratorName: row.administratorName,
    factoryPlantName: row.factoryPlantName,
    department: row.department,
    branchLocation: row.branchLocation,
    status: row.status,
    undo: mapUndoPayload(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    asset: mapAssetNested(row.asset, totals.depreciationPerUnit),
    totals: {
      recordedUnits: totals.recordedUnits,
      depreciableAmount: totals.depreciableAmount,
      depreciationPerUnit: totals.depreciationPerUnit,
      recordedCharge: totals.recordedCharge,
      accumulatedDepreciation: totals.accumulatedDepreciation,
      bookValue: totals.bookValue,
    },
    schedule,
  };
}

function buildUnitAttributionListStatusFilter(
  status?: string,
): string | { notIn: string[] } {
  const normalized = status?.trim() || "all";
  if (normalized === "all") {
    return {
      notIn: [RECORD_UNDO_STATUS.VOIDED, RECORD_UNDO_STATUS.REVERSED],
    };
  }
  if (normalized === RECORD_UNDO_STATUS.VOIDED || normalized === "Voided") {
    return RECORD_UNDO_STATUS.VOIDED;
  }
  if (normalized === RECORD_UNDO_STATUS.REVERSED || normalized === "Reversed") {
    return RECORD_UNDO_STATUS.REVERSED;
  }
  return normalized;
}

export const unitAttributionService = {
  async create(
    userId: string,
    input: {
      assetId: string;
      productName: string;
      brandName?: string | null;
      skuCode?: string | null;
      description?: string | null;
      unitOfMeasurement: string;
      periodType: UnitAttributionPeriodType;
      administratorName?: string | null;
      factoryPlantName?: string | null;
      department?: string | null;
      branchLocation?: string | null;
    },
  ) {
    const asset = await prisma.asset.findFirst({
      where: { id: input.assetId, userId },
    });
    if (!asset) throw new HttpReplyError(404, "Asset not found");
    assertEligibleAsset(asset);

    const existing = await prisma.unitAttribution.findUnique({
      where: { assetId: input.assetId },
    });
    if (existing) {
      throw new HttpReplyError(409, "Asset already has a unit attribution");
    }

    const row = await prisma.unitAttribution.create({
      data: {
        userId,
        assetId: input.assetId,
        productName: input.productName.trim(),
        brandName: input.brandName?.trim() || null,
        skuCode: input.skuCode?.trim() || null,
        description: input.description?.trim() || null,
        unitOfMeasurement: input.unitOfMeasurement.trim(),
        periodType: input.periodType,
        administratorName: input.administratorName?.trim() || null,
        factoryPlantName: input.factoryPlantName?.trim() || null,
        department: input.department?.trim() || null,
        branchLocation: input.branchLocation?.trim() || null,
      },
      include: { asset: true },
    });

    return buildDetail(userId, row.id);
  },

  async list(userId: string, page: number, limit: number, status?: string) {
    const skip = (page - 1) * limit;
    const normalizedStatus = status?.trim() || "all";
    const baseWhere = { userId };
    const listWhere = {
      ...baseWhere,
      status: buildUnitAttributionListStatusFilter(normalizedStatus),
    };
    const [rows, totalRecords, counts] = await Promise.all([
      prisma.unitAttribution.findMany({
        where: listWhere,
        include: {
          asset: {
            select: {
              id: true,
              assetName: true,
              assetCode: true,
              assetType: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.unitAttribution.count({ where: listWhere }),
      prisma.unitAttribution.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: true,
      }),
    ]);

    const dbCount = (s: string) =>
      counts.find((c) => c.status === s)?._count ?? 0;
    const liveAll = counts.reduce((sum, c) => {
      if (
        c.status === RECORD_UNDO_STATUS.VOIDED ||
        c.status === RECORD_UNDO_STATUS.REVERSED
      ) {
        return sum;
      }
      return sum + c._count;
    }, 0);

    return {
      counts: {
        all: liveAll,
        voided: dbCount(RECORD_UNDO_STATUS.VOIDED),
        reversed: dbCount(RECORD_UNDO_STATUS.REVERSED),
      },
      items: rows.map(mapListItem),
      page,
      limit,
      totalRecords,
      totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
    };
  },

  async getById(userId: string, id: string) {
    return buildDetail(userId, id);
  },

  async getSchedule(userId: string, id: string) {
    const row = await prisma.unitAttribution.findFirst({
      where: { id, userId },
      include: { asset: true, records: true },
    });
    if (!row) throw new HttpReplyError(404, "Unit attribution not found");

    const recordedUnits = row.records
      .filter((r) => r.status === PRODUCTION_RECORD_STATUS.RECORDED)
      .reduce((s, r) => s + r.unitsAttributed, 0);
    const totals = computeTotals(row.asset, recordedUnits);
    const schedule = await buildSchedule(
      row.periodType as UnitAttributionPeriodType,
      row.id,
      totals.depreciationPerUnit,
      row.createdAt,
    );

    return { schedule, totals: { depreciationPerUnit: totals.depreciationPerUnit } };
  },

  async recordProduction(
    userId: string,
    id: string,
    input: {
      periodStart: string;
      unitsAttributed: number;
      unitCost?: number | null;
      batchLotNumber?: string | null;
      productionLine?: string | null;
      shift?: string | null;
      locationWarehouse?: string | null;
    },
  ) {
    if (!Number.isInteger(input.unitsAttributed) || input.unitsAttributed <= 0) {
      throw new HttpReplyError(400, "unitsAttributed must be a positive integer");
    }

    return prisma.$transaction(async (tx) => {
      const row = await tx.unitAttribution.findFirst({
        where: { id, userId },
        include: { asset: true, records: true },
      });
      if (!row) throw new HttpReplyError(404, "Unit attribution not found");
      if (isUndoneStatus(row.status)) {
        throw new HttpReplyError(
          409,
          "This unit attribution has already been voided or reversed",
        );
      }
      assertEligibleAsset(row.asset);

      const periodType = row.periodType as UnitAttributionPeriodType;
      const periodStart = parsePeriodStartInput(input.periodStart);
      validatePeriodStart(periodType, periodStart);
      const periodEnd = derivePeriodEnd(periodType, periodStart);

      const duplicate = await tx.unitAttributionProductionRecord.findFirst({
        where: {
          unitAttributionId: id,
          periodStart,
          status: PRODUCTION_RECORD_STATUS.RECORDED,
        },
      });
      if (duplicate) {
        throw new HttpReplyError(409, "Period already recorded");
      }

      const recordedUnits = row.records
        .filter((r) => r.status === PRODUCTION_RECORD_STATUS.RECORDED)
        .reduce((s, r) => s + r.unitsAttributed, 0);
      const totalEstimated = d(row.asset.totalEstimatedUnit);
      if (recordedUnits + input.unitsAttributed > totalEstimated) {
        throw new HttpReplyError(
          400,
          "Cumulative units would exceed totalEstimatedUnit",
        );
      }

      const periodLabel = buildPeriodLabel(periodType, periodStart, periodEnd);
      const created = await tx.unitAttributionProductionRecord.create({
        data: {
          unitAttributionId: id,
          periodStart,
          periodEnd,
          periodLabel,
          unitsAttributed: input.unitsAttributed,
          status: PRODUCTION_RECORD_STATUS.RECORDED,
          unitCost:
            input.unitCost != null ? dec(input.unitCost) : null,
          batchLotNumber: input.batchLotNumber?.trim() || null,
          productionLine: input.productionLine?.trim() || null,
          shift: input.shift?.trim() || null,
          locationWarehouse: input.locationWarehouse?.trim() || null,
        },
      });

      const totals = computeTotals(row.asset, recordedUnits + input.unitsAttributed);
      await ledgerPostingService.postUnitOfProductionDepreciation(
        userId,
        created.id,
        totals.depreciationPerUnit * input.unitsAttributed,
        periodEnd,
        tx,
      );

      const newUnitProduced = recordedUnits + input.unitsAttributed;
      await tx.asset.update({
        where: { id: row.assetId },
        data: { unitProduced: dec(newUnitProduced) },
      });
    });

    return buildDetail(userId, id);
  },
};

export async function listUnitsOfProductionEligibleAssets(userId: string) {
  const assets = await prisma.asset.findMany({
    where: {
      userId,
      depreciationMethod: { in: ["UNIT_OF_PRODUCTION", "UNITS_OF_PRODUCTION"] },
      status: {
        notIn: [
          ASSET_STATUS.SOLD,
          ASSET_STATUS.DISPOSED,
          RECORD_UNDO_STATUS.VOIDED,
          RECORD_UNDO_STATUS.REVERSED,
        ],
      },
    },
    orderBy: [{ assetName: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      assetCode: true,
      assetName: true,
      assetType: true,
      status: true,
      depreciationMethod: true,
      totalEstimatedUnit: true,
      unitProduced: true,
      purchaseCost: true,
      residualValue: true,
      purchaseDate: true,
    },
  });

  return assets.map((a) => ({
    id: a.id,
    assetCode: a.assetCode,
    assetName: a.assetName,
    assetType: a.assetType,
    status: a.status,
    depreciationMethod: "UNIT_OF_PRODUCTION",
    totalEstimatedUnit: d(a.totalEstimatedUnit),
    unitProduced: d(a.unitProduced),
    purchaseCost: d(a.purchaseCost),
    residualValue: d(a.residualValue),
    purchaseDate: formatPeriodYmd(a.purchaseDate),
  }));
}
