import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  CONSULTANT_REVIEW_STATUSES,
  GAIN_LOSS_TYPES,
  TRANSFER_STATUSES,
  type AssetStatus,
  type GainLossType,
} from "../../constants/assets";
import { PERCENT } from "../../constants/percentages";
import { HttpReplyError } from "../../utils/httpReplyError";
import {
  assertMonetaryAmountInRange,
  normalizeMoneyAmount,
} from "../../utils/monetaryAmount";

const ASSET_COUNTER_ID = "asset_number";
const TRANSFER_COUNTER_ID = "asset_transfer_number";
const SALE_COUNTER_ID = "asset_sale_number";
const DISPOSAL_COUNTER_ID = "asset_disposal_number";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function d(v: Decimal | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

function dec(n: number): Decimal {
  return new Decimal(normalizeMoneyAmount(n));
}

function parseDateOnly(value: string): Date {
  return new Date(`${value.trim()}T12:00:00.000Z`);
}

function dateToIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function nextCodedNumber(
  counterId: string,
  prefix: string,
): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { id: counterId },
    create: { id: counterId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${prefix}-${String(counter.lastNumber).padStart(4, "0")}`;
}

type DepreciationInput = {
  purchaseCost: number;
  purchaseDate: Date;
  usefulLife: number | null | undefined;
  residualValue: number | null | undefined;
  asOf?: Date;
};

export function computeStraightLineDepreciation(input: DepreciationInput) {
  const cost = normalizeMoneyAmount(input.purchaseCost);
  const residual = normalizeMoneyAmount(Math.max(0, input.residualValue ?? 0));
  const usefulLife = input.usefulLife ?? null;
  const asOf = input.asOf ?? new Date();

  if (!usefulLife || usefulLife <= 0 || cost <= residual) {
    return {
      annualDepreciation: 0,
      accumulatedDepreciation: 0,
      bookValue: cost,
      remainingUsefulLife: usefulLife ?? null,
      depreciationPercentage: 0,
    };
  }

  const depreciable = cost - residual;
  const annualDepreciation = normalizeMoneyAmount(depreciable / usefulLife);
  const yearsElapsed = Math.max(
    0,
    (asOf.getTime() - input.purchaseDate.getTime()) / (MS_PER_DAY * DAYS_PER_YEAR),
  );
  const rawAccumulated = annualDepreciation * yearsElapsed;
  const accumulatedDepreciation = normalizeMoneyAmount(
    Math.min(depreciable, Math.max(0, rawAccumulated)),
  );
  const bookValue = normalizeMoneyAmount(
    Math.max(residual, cost - accumulatedDepreciation),
  );
  const remainingUsefulLife = normalizeMoneyAmount(
    Math.max(0, usefulLife - yearsElapsed),
  );
  const depreciationPercentage = normalizeMoneyAmount(PERCENT / usefulLife);

  return {
    annualDepreciation,
    accumulatedDepreciation,
    bookValue,
    remainingUsefulLife,
    depreciationPercentage,
  };
}

function deriveGainLoss(
  salePrice: number,
  bookValue: number,
): { gainLossType: GainLossType; gainLossAmount: number } {
  const diff = normalizeMoneyAmount(salePrice - bookValue);
  if (diff > 0) {
    return { gainLossType: GAIN_LOSS_TYPES[0], gainLossAmount: diff };
  }
  if (diff < 0) {
    return {
      gainLossType: GAIN_LOSS_TYPES[1],
      gainLossAmount: normalizeMoneyAmount(Math.abs(diff)),
    };
  }
  return { gainLossType: GAIN_LOSS_TYPES[2], gainLossAmount: 0 };
}

async function findOwnedAsset(userId: string, assetRef: string) {
  const ref = assetRef.trim();
  if (!ref) return null;
  if (UUID_RE.test(ref)) {
    return prisma.asset.findFirst({ where: { id: ref, userId } });
  }
  return prisma.asset.findFirst({
    where: { userId, assetCode: ref },
  });
}

function mapAssetRow(
  asset: {
    id: string;
    assetCode: string;
    assetName: string;
    assetType: string;
    purchaseCost: Decimal;
    purchaseDate: Date;
    vendor: string | null;
    evidenceUrl: string | null;
    depreciationMethod: string | null;
    usefulLife: number | null;
    residualValue: Decimal | null;
    serialNumber: string | null;
    assetLocation: string | null;
    additionalNote: string | null;
    assignToConsultant: boolean;
    consultantReviewStatus: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
  asOf = new Date(),
) {
  const cost = d(asset.purchaseCost);
  const dep = computeStraightLineDepreciation({
    purchaseCost: cost,
    purchaseDate: asset.purchaseDate,
    usefulLife: asset.usefulLife,
    residualValue: d(asset.residualValue),
    asOf,
  });

  return {
    id: asset.id,
    assetId: asset.assetCode,
    assetCode: asset.assetCode,
    assetName: asset.assetName,
    assetType: asset.assetType,
    purchaseCost: cost,
    bookValue: dep.bookValue,
    purchaseDate: dateToIsoDate(asset.purchaseDate),
    vendor: asset.vendor,
    evidenceUrl: asset.evidenceUrl,
    depreciationMethod: asset.depreciationMethod,
    depreciationPercentage: dep.depreciationPercentage,
    usefulLife: asset.usefulLife,
    remainingUsefulLife: dep.remainingUsefulLife,
    residualValue: asset.residualValue != null ? d(asset.residualValue) : null,
    accumulatedDepreciation: dep.accumulatedDepreciation,
    annualDepreciation: dep.annualDepreciation,
    serialNumber: asset.serialNumber,
    assetLocation: asset.assetLocation,
    additionalNote: asset.additionalNote,
    assignToConsultant: asset.assignToConsultant,
    consultantReviewStatus: asset.consultantReviewStatus,
    status: asset.status,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export const assetsService = {
  async summary(userId: string) {
    const assets = await prisma.asset.findMany({
      where: { userId, status: ASSET_STATUSES[0] },
    });
    let purchaseCost = 0;
    let accumulatedDepreciation = 0;
    let totalNetAssetValue = 0;
    const now = new Date();
    for (const a of assets) {
      const cost = d(a.purchaseCost);
      const dep = computeStraightLineDepreciation({
        purchaseCost: cost,
        purchaseDate: a.purchaseDate,
        usefulLife: a.usefulLife,
        residualValue: d(a.residualValue),
        asOf: now,
      });
      purchaseCost += cost;
      accumulatedDepreciation += dep.accumulatedDepreciation;
      totalNetAssetValue += dep.bookValue;
    }
    return {
      totalNetAssetValue: normalizeMoneyAmount(totalNetAssetValue),
      purchaseCost: normalizeMoneyAmount(purchaseCost),
      accumulatedDepreciation: normalizeMoneyAmount(accumulatedDepreciation),
    };
  },

  async create(
    userId: string,
    data: {
      assetType: string;
      assetName: string;
      purchaseDate: string;
      purchaseCost: number;
      vendor?: string;
      evidenceUrl?: string;
      depreciationMethod?: string;
      usefulLife?: number;
      residualValue?: number;
      serialNumber?: string;
      assetLocation?: string;
      additionalNote?: string;
      assignToConsultant?: boolean;
    },
  ) {
    assertMonetaryAmountInRange(data.purchaseCost, "purchaseCost");
    if (data.residualValue != null) {
      assertMonetaryAmountInRange(data.residualValue, "residualValue");
    }

    const assignToConsultant = data.assignToConsultant === true;
    const assetCode = await nextCodedNumber(ASSET_COUNTER_ID, "AST");
    const asset = await prisma.asset.create({
      data: {
        userId,
        assetCode,
        assetType: data.assetType,
        assetName: data.assetName.trim(),
        purchaseDate: parseDateOnly(data.purchaseDate),
        purchaseCost: dec(data.purchaseCost),
        vendor: data.vendor?.trim() || null,
        evidenceUrl: data.evidenceUrl?.trim() || null,
        depreciationMethod: data.depreciationMethod?.trim() || null,
        usefulLife: data.usefulLife ?? null,
        residualValue:
          data.residualValue != null ? dec(data.residualValue) : null,
        serialNumber: data.serialNumber?.trim() || null,
        assetLocation: data.assetLocation?.trim() || null,
        additionalNote: data.additionalNote?.trim() || null,
        assignToConsultant,
        consultantReviewStatus: assignToConsultant
          ? CONSULTANT_REVIEW_STATUSES[0]
          : null,
        status: ASSET_STATUSES[0],
      },
    });
    return mapAssetRow(asset);
  },

  async update(
    userId: string,
    assetId: string,
    data: Partial<{
      assetType: string;
      assetName: string;
      purchaseDate: string;
      purchaseCost: number;
      vendor: string | null;
      evidenceUrl: string | null;
      depreciationMethod: string | null;
      usefulLife: number | null;
      residualValue: number | null;
      serialNumber: string | null;
      assetLocation: string | null;
      additionalNote: string | null;
      assignToConsultant: boolean;
    }>,
  ) {
    const existing = await prisma.asset.findFirst({
      where: { id: assetId, userId },
    });
    if (!existing) return null;
    if (existing.status !== ASSET_STATUSES[0]) {
      throw new HttpReplyError(
        400,
        `Cannot update asset with status ${existing.status}`,
      );
    }

    if (data.purchaseCost != null) {
      assertMonetaryAmountInRange(data.purchaseCost, "purchaseCost");
    }
    if (data.residualValue != null) {
      assertMonetaryAmountInRange(data.residualValue, "residualValue");
    }

    const updateData: Record<string, unknown> = {};
    if (data.assetType != null) updateData.assetType = data.assetType;
    if (data.assetName != null) updateData.assetName = data.assetName.trim();
    if (data.purchaseDate != null) {
      updateData.purchaseDate = parseDateOnly(data.purchaseDate);
    }
    if (data.purchaseCost != null) {
      updateData.purchaseCost = dec(data.purchaseCost);
    }
    if (data.vendor !== undefined) {
      updateData.vendor = data.vendor?.trim() || null;
    }
    if (data.evidenceUrl !== undefined) {
      updateData.evidenceUrl = data.evidenceUrl?.trim() || null;
    }
    if (data.depreciationMethod !== undefined) {
      updateData.depreciationMethod = data.depreciationMethod?.trim() || null;
    }
    if (data.usefulLife !== undefined) updateData.usefulLife = data.usefulLife;
    if (data.residualValue !== undefined) {
      updateData.residualValue =
        data.residualValue != null ? dec(data.residualValue) : null;
    }
    if (data.serialNumber !== undefined) {
      updateData.serialNumber = data.serialNumber?.trim() || null;
    }
    if (data.assetLocation !== undefined) {
      updateData.assetLocation = data.assetLocation?.trim() || null;
    }
    if (data.additionalNote !== undefined) {
      updateData.additionalNote = data.additionalNote?.trim() || null;
    }
    if (data.assignToConsultant !== undefined) {
      updateData.assignToConsultant = data.assignToConsultant;
      if (data.assignToConsultant === true) {
        if (!existing.consultantReviewStatus) {
          updateData.consultantReviewStatus = CONSULTANT_REVIEW_STATUSES[0];
        }
      } else if (data.assignToConsultant === false) {
        updateData.consultantReviewStatus = null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return mapAssetRow(existing);
    }

    const updated = await prisma.asset.update({
      where: { id: assetId },
      data: updateData,
    });
    return mapAssetRow(updated);
  },

  async list(
    userId: string,
    opts?: {
      page?: number;
      limit?: number;
      assetType?: string;
      status?: string;
    },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where: {
      userId: string;
      assetType?: string;
      status?: string;
    } = { userId };
    if (opts?.assetType?.trim()) where.assetType = opts.assetType.trim();
    if (opts?.status?.trim()) where.status = opts.status.trim();

    const [rows, total, pendingReviews] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.asset.count({ where }),
      prisma.asset.count({
        where: {
          userId,
          assignToConsultant: true,
          consultantReviewStatus: CONSULTANT_REVIEW_STATUSES[0],
        },
      }),
    ]);

    const now = new Date();
    const assets = rows.map((a) => mapAssetRow(a, now));
    const totalNetBookValue = normalizeMoneyAmount(
      assets.reduce((s, a) => s + a.bookValue, 0),
    );

    return {
      summary: {
        totalAssets: total,
        totalNetBookValue,
        pendingReviews,
      },
      assets,
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async getById(userId: string, assetId: string) {
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, userId },
    });
    if (!asset) return null;
    return mapAssetRow(asset);
  },

  async dashboard(userId: string) {
    const [assets, pendingReviews, inventoryCount, unpaidSalesCount] =
      await Promise.all([
        prisma.asset.findMany({
          where: { userId, status: ASSET_STATUSES[0] },
        }),
        prisma.asset.count({
          where: {
            userId,
            assignToConsultant: true,
            consultantReviewStatus: CONSULTANT_REVIEW_STATUSES[0],
          },
        }),
        prisma.inventoryItem.count({ where: { userId } }),
        prisma.sale.count({
          where: {
            userId,
            status: { in: ["Pending", "Overdue"] },
          },
        }),
      ]);

    const now = new Date();
    let totalCost = 0;
    let annualDepreciation = 0;
    let softwareAmortization = 0;
    const costByType = new Map<string, number>();
    for (const t of ASSET_TYPES) costByType.set(t, 0);

    for (const a of assets) {
      const cost = d(a.purchaseCost);
      totalCost += cost;
      costByType.set(a.assetType, (costByType.get(a.assetType) ?? 0) + cost);
      const dep = computeStraightLineDepreciation({
        purchaseCost: cost,
        purchaseDate: a.purchaseDate,
        usefulLife: a.usefulLife,
        residualValue: d(a.residualValue),
        asOf: now,
      });
      annualDepreciation += dep.annualDepreciation;
      if (a.assetType === "SOFTWARE_LICENSES") {
        softwareAmortization += dep.annualDepreciation;
      }
    }

    const nonCurrentAssetCategories = ASSET_TYPES.map((assetType) => {
      const cost = normalizeMoneyAmount(costByType.get(assetType) ?? 0);
      return {
        assetType,
        cost,
        percentage:
          totalCost > 0
            ? normalizeMoneyAmount((cost / totalCost) * PERCENT)
            : 0,
      };
    });

    return {
      summary: {
        pendingReviews,
        currentAssets: inventoryCount + unpaidSalesCount,
        nonCurrentAssets: assets.length,
        annualDepreciation: normalizeMoneyAmount(annualDepreciation),
      },
      nonCurrentAssetCategories,
      plImpact: {
        annualDepreciationCharge: normalizeMoneyAmount(annualDepreciation),
        softwareAmortization: normalizeMoneyAmount(softwareAmortization),
        capitalAllowance: 0,
        netTaxBenefit: 0,
      },
    };
  },

  async currentAssets(userId: string) {
    const [inventoryItems, unpaidSales] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { userId } }),
      prisma.sale.findMany({
        where: {
          userId,
          status: { in: ["Pending", "Overdue"] },
        },
        orderBy: { saleDate: "desc" },
      }),
    ]);

    const inventoryRows = inventoryItems
      .map((it) => {
        const amount = normalizeMoneyAmount(d(it.quantity) * d(it.purchaseCost));
        return {
          stockName: it.name,
          amount,
          quantity: d(it.quantity),
        };
      })
      .filter((r) => r.amount > 0 || r.quantity > 0);

    const inventoryTotal = normalizeMoneyAmount(
      inventoryRows.reduce((s, r) => s + r.amount, 0),
    );

    const arItems = unpaidSales.map((s) => ({
      invoiceNumber: s.invoiceNumber,
      customerName: s.customerName,
      status: s.status === "Overdue" ? "OVERDUE" : "CURRENT",
      amount: normalizeMoneyAmount(d(s.totalAmount)),
    }));
    const arTotal = normalizeMoneyAmount(
      arItems.reduce((s, r) => s + r.amount, 0),
    );

    const cash = { total: 0, items: [] as Array<{ title: string; subtitle: string; amount: number }> };
    const bankBalances = {
      total: 0,
      items: [] as Array<{
        bankName: string;
        accountType: string;
        accountNumber: string;
        amount: number;
      }>,
    };

    return {
      totalCurrentAssets: normalizeMoneyAmount(
        cash.total + bankBalances.total + inventoryTotal + arTotal,
      ),
      cash,
      bankBalances,
      inventory: {
        total: inventoryTotal,
        numberOfSku: inventoryRows.length,
        items: inventoryRows.map(({ stockName, amount }) => ({
          stockName,
          amount,
        })),
      },
      accountsReceivable: {
        total: arTotal,
        items: arItems,
      },
    };
  },

  async nonCurrentAssets(userId: string) {
    const assets = await prisma.asset.findMany({
      where: { userId, status: ASSET_STATUSES[0] },
      orderBy: { assetName: "asc" },
    });
    const now = new Date();
    const byType = new Map<
      string,
      Array<{
        assetId: string;
        name: string;
        assetLocation: string | null;
        amount: number;
      }>
    >();
    for (const t of ASSET_TYPES) byType.set(t, []);

    let total = 0;
    for (const a of assets) {
      const dep = computeStraightLineDepreciation({
        purchaseCost: d(a.purchaseCost),
        purchaseDate: a.purchaseDate,
        usefulLife: a.usefulLife,
        residualValue: d(a.residualValue),
        asOf: now,
      });
      const amount = dep.bookValue;
      total += amount;
      const list = byType.get(a.assetType) ?? [];
      list.push({
        assetId: a.assetCode,
        name: a.assetName,
        assetLocation: a.assetLocation,
        amount,
      });
      byType.set(a.assetType, list);
    }

    return {
      total: normalizeMoneyAmount(total),
      categories: ASSET_TYPES.map((assetType) => {
        const rows = byType.get(assetType) ?? [];
        return {
          assetType,
          total: normalizeMoneyAmount(rows.reduce((s, r) => s + r.amount, 0)),
          assets: rows,
        };
      }),
    };
  },

  async depreciationAmortization(userId: string) {
    const assets = await prisma.asset.findMany({
      where: { userId, status: ASSET_STATUSES[0] },
      orderBy: { assetName: "asc" },
    });
    const now = new Date();
    const rows = assets.map((a) => {
      const dep = computeStraightLineDepreciation({
        purchaseCost: d(a.purchaseCost),
        purchaseDate: a.purchaseDate,
        usefulLife: a.usefulLife,
        residualValue: d(a.residualValue),
        asOf: now,
      });
      return {
        assetId: a.assetCode,
        name: a.assetName,
        assetType: a.assetType,
        depreciationPercentage: dep.depreciationPercentage,
        depreciationMethod: a.depreciationMethod,
        accumulatedDepreciation: dep.accumulatedDepreciation,
        bookValue: dep.bookValue,
        remainingUsefulLife: dep.remainingUsefulLife,
        annualDepreciation: dep.annualDepreciation,
      };
    });

    return {
      total: normalizeMoneyAmount(
        rows.reduce((s, r) => s + r.accumulatedDepreciation, 0),
      ),
      assets: rows,
    };
  },

  async createTransfer(
    userId: string,
    data: {
      assetId: string;
      transferType: string;
      fromLocation: string;
      toLocation: string;
      transferDate: string;
      reason: string;
    },
  ) {
    const asset = await findOwnedAsset(userId, data.assetId);
    if (!asset) throw new HttpReplyError(400, "Asset not found");
    if (asset.status !== ASSET_STATUSES[0]) {
      throw new HttpReplyError(
        400,
        `Cannot transfer asset with status ${asset.status}`,
      );
    }

    const pending = await prisma.assetTransfer.findFirst({
      where: {
        userId,
        assetId: asset.id,
        status: TRANSFER_STATUSES[0],
      },
    });
    if (pending) {
      throw new HttpReplyError(
        409,
        "Asset already has a pending transfer",
      );
    }

    const transferCode = await nextCodedNumber(TRANSFER_COUNTER_ID, "TRF");
    const transfer = await prisma.assetTransfer.create({
      data: {
        userId,
        transferCode,
        assetId: asset.id,
        transferType: data.transferType,
        fromLocation: data.fromLocation.trim(),
        toLocation: data.toLocation.trim(),
        transferDate: parseDateOnly(data.transferDate),
        reason: data.reason.trim(),
        status: TRANSFER_STATUSES[0],
      },
    });

    return {
      id: transfer.id,
      transferId: transfer.transferCode,
      assetId: asset.assetCode,
      assetName: asset.assetName,
      assetType: asset.assetType,
      transferType: transfer.transferType,
      status: transfer.status,
      fromLocation: transfer.fromLocation,
      toLocation: transfer.toLocation,
      transferDate: dateToIsoDate(transfer.transferDate),
      reason: transfer.reason,
    };
  },

  async listTransfers(
    userId: string,
    opts?: { page?: number; limit?: number; status?: string },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where: { userId: string; status?: string } = { userId };
    if (opts?.status?.trim()) where.status = opts.status.trim();

    const [rows, total] = await Promise.all([
      prisma.assetTransfer.findMany({
        where,
        include: {
          asset: {
            select: {
              assetCode: true,
              assetName: true,
              assetType: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetTransfer.count({ where }),
    ]);

    return {
      summary: { totalTransfers: total },
      transfers: rows.map((t) => ({
        id: t.id,
        transferId: t.transferCode,
        assetId: t.asset.assetCode,
        assetName: t.asset.assetName,
        assetType: t.asset.assetType,
        transferType: t.transferType,
        status: t.status,
        fromLocation: t.fromLocation,
        toLocation: t.toLocation,
        transferDate: dateToIsoDate(t.transferDate),
        reason: t.reason,
      })),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async updateTransfer(
    userId: string,
    transferId: string,
    data: Partial<{
      transferType: string;
      fromLocation: string;
      toLocation: string;
      transferDate: string;
      reason: string;
    }>,
  ) {
    const existing = await prisma.assetTransfer.findFirst({
      where: { id: transferId, userId },
      include: {
        asset: {
          select: { assetCode: true, assetName: true, assetType: true },
        },
      },
    });
    if (!existing) return null;
    if (existing.status !== TRANSFER_STATUSES[0]) {
      throw new HttpReplyError(
        400,
        "Only pending transfers can be updated",
      );
    }

    const updateData: Record<string, unknown> = {};
    if (data.transferType != null) updateData.transferType = data.transferType;
    if (data.fromLocation != null) {
      updateData.fromLocation = data.fromLocation.trim();
    }
    if (data.toLocation != null) {
      updateData.toLocation = data.toLocation.trim();
    }
    if (data.transferDate != null) {
      updateData.transferDate = parseDateOnly(data.transferDate);
    }
    if (data.reason != null) updateData.reason = data.reason.trim();

    const updated =
      Object.keys(updateData).length === 0
        ? existing
        : await prisma.assetTransfer.update({
            where: { id: transferId },
            data: updateData,
            include: {
              asset: {
                select: {
                  assetCode: true,
                  assetName: true,
                  assetType: true,
                },
              },
            },
          });

    return {
      id: updated.id,
      transferId: updated.transferCode,
      assetId: updated.asset.assetCode,
      assetName: updated.asset.assetName,
      assetType: updated.asset.assetType,
      transferType: updated.transferType,
      status: updated.status,
      fromLocation: updated.fromLocation,
      toLocation: updated.toLocation,
      transferDate: dateToIsoDate(updated.transferDate),
      reason: updated.reason,
    };
  },

  async approveTransfer(userId: string, transferId: string) {
    return prisma.$transaction(async (tx) => {
      const transfer = await tx.assetTransfer.findFirst({
        where: { id: transferId, userId },
        include: {
          asset: {
            select: {
              id: true,
              assetCode: true,
              assetName: true,
              assetType: true,
              status: true,
            },
          },
        },
      });
      if (!transfer) return null;
      if (transfer.status !== TRANSFER_STATUSES[0]) {
        throw new HttpReplyError(400, "Only pending transfers can be approved");
      }
      if (transfer.asset.status !== ASSET_STATUSES[0]) {
        throw new HttpReplyError(
          400,
          `Cannot approve transfer for asset with status ${transfer.asset.status}`,
        );
      }

      const updated = await tx.assetTransfer.update({
        where: { id: transferId },
        data: { status: TRANSFER_STATUSES[1] },
      });
      await tx.asset.update({
        where: { id: transfer.assetId },
        data: { assetLocation: transfer.toLocation },
      });

      return {
        id: updated.id,
        transferId: updated.transferCode,
        assetId: transfer.asset.assetCode,
        assetName: transfer.asset.assetName,
        assetType: transfer.asset.assetType,
        transferType: updated.transferType,
        status: updated.status,
        fromLocation: updated.fromLocation,
        toLocation: updated.toLocation,
        transferDate: dateToIsoDate(updated.transferDate),
        reason: updated.reason,
      };
    });
  },

  async rejectTransfer(userId: string, transferId: string) {
    const transfer = await prisma.assetTransfer.findFirst({
      where: { id: transferId, userId },
      include: {
        asset: {
          select: { assetCode: true, assetName: true, assetType: true },
        },
      },
    });
    if (!transfer) return null;
    if (transfer.status !== TRANSFER_STATUSES[0]) {
      throw new HttpReplyError(400, "Only pending transfers can be rejected");
    }

    const updated = await prisma.assetTransfer.update({
      where: { id: transferId },
      data: { status: TRANSFER_STATUSES[2] },
    });

    return {
      id: updated.id,
      transferId: updated.transferCode,
      assetId: transfer.asset.assetCode,
      assetName: transfer.asset.assetName,
      assetType: transfer.asset.assetType,
      transferType: updated.transferType,
      status: updated.status,
      fromLocation: updated.fromLocation,
      toLocation: updated.toLocation,
      transferDate: dateToIsoDate(updated.transferDate),
      reason: updated.reason,
    };
  },

  async createSale(
    userId: string,
    data: {
      assetId: string;
      saleDate: string;
      salePrice: number;
      buyer: string;
    },
  ) {
    assertMonetaryAmountInRange(data.salePrice, "salePrice");

    const asset = await findOwnedAsset(userId, data.assetId);
    if (!asset) throw new HttpReplyError(400, "Asset not found");
    if (asset.status !== ASSET_STATUSES[0]) {
      throw new HttpReplyError(
        400,
        `Cannot sell asset with status ${asset.status}`,
      );
    }

    const saleDate = parseDateOnly(data.saleDate);
    const dep = computeStraightLineDepreciation({
      purchaseCost: d(asset.purchaseCost),
      purchaseDate: asset.purchaseDate,
      usefulLife: asset.usefulLife,
      residualValue: d(asset.residualValue),
      asOf: saleDate,
    });
    const bookValue = dep.bookValue;
    const { gainLossType, gainLossAmount } = deriveGainLoss(
      data.salePrice,
      bookValue,
    );

    const saleCode = await nextCodedNumber(SALE_COUNTER_ID, "SAL");
    const sale = await prisma.$transaction(async (tx) => {
      const row = await tx.assetSale.create({
        data: {
          userId,
          saleCode,
          assetId: asset.id,
          saleDate,
          salePrice: dec(data.salePrice),
          buyer: data.buyer.trim(),
          bookValueAtSale: dec(bookValue),
          gainLossType,
          gainLossAmount: dec(gainLossAmount),
        },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: ASSET_STATUSES[1] satisfies AssetStatus },
      });
      await tx.assetTransfer.updateMany({
        where: {
          assetId: asset.id,
          status: TRANSFER_STATUSES[0],
        },
        data: { status: TRANSFER_STATUSES[2] },
      });
      return row;
    });

    return {
      id: sale.id,
      saleId: sale.saleCode,
      assetId: asset.assetCode,
      assetName: asset.assetName,
      assetType: asset.assetType,
      buyer: sale.buyer,
      saleDate: dateToIsoDate(sale.saleDate),
      salePrice: d(sale.salePrice),
      bookValue: d(sale.bookValueAtSale),
      gainLossType: sale.gainLossType,
      gainLossAmount: d(sale.gainLossAmount),
    };
  },

  async listSales(
    userId: string,
    opts?: { page?: number; limit?: number },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where = { userId };

    const [rows, total, agg] = await Promise.all([
      prisma.assetSale.findMany({
        where,
        include: {
          asset: {
            select: { assetCode: true, assetName: true, assetType: true },
          },
        },
        orderBy: { saleDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetSale.count({ where }),
      prisma.assetSale.aggregate({
        where,
        _sum: { salePrice: true },
      }),
    ]);

    return {
      summary: {
        totalSales: total,
        totalSaleValue: normalizeMoneyAmount(d(agg._sum.salePrice)),
      },
      sales: rows.map((s) => ({
        id: s.id,
        saleId: s.saleCode,
        assetId: s.asset.assetCode,
        assetName: s.asset.assetName,
        assetType: s.asset.assetType,
        buyer: s.buyer,
        saleDate: dateToIsoDate(s.saleDate),
        salePrice: d(s.salePrice),
        bookValue: d(s.bookValueAtSale),
        gainLossType: s.gainLossType,
        gainLossAmount: d(s.gainLossAmount),
      })),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async createDisposal(
    userId: string,
    data: {
      assetId: string;
      disposalReason: string;
      disposalDate: string;
      note: string;
      evidenceUrl?: string;
    },
  ) {
    const asset = await findOwnedAsset(userId, data.assetId);
    if (!asset) throw new HttpReplyError(400, "Asset not found");
    if (asset.status !== ASSET_STATUSES[0]) {
      throw new HttpReplyError(
        400,
        `Cannot dispose asset with status ${asset.status}`,
      );
    }

    const disposalDate = parseDateOnly(data.disposalDate);
    const dep = computeStraightLineDepreciation({
      purchaseCost: d(asset.purchaseCost),
      purchaseDate: asset.purchaseDate,
      usefulLife: asset.usefulLife,
      residualValue: d(asset.residualValue),
      asOf: disposalDate,
    });

    const disposalCode = await nextCodedNumber(DISPOSAL_COUNTER_ID, "DSP");
    const disposal = await prisma.$transaction(async (tx) => {
      const row = await tx.assetDisposal.create({
        data: {
          userId,
          disposalCode,
          assetId: asset.id,
          disposalReason: data.disposalReason,
          disposalDate,
          note: data.note.trim(),
          evidenceUrl: data.evidenceUrl?.trim() || null,
          bookValueAtDisposal: dec(dep.bookValue),
        },
      });
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: ASSET_STATUSES[2] satisfies AssetStatus },
      });
      await tx.assetTransfer.updateMany({
        where: {
          assetId: asset.id,
          status: TRANSFER_STATUSES[0],
        },
        data: { status: TRANSFER_STATUSES[2] },
      });
      return row;
    });

    return {
      id: disposal.id,
      disposalId: disposal.disposalCode,
      assetId: asset.assetCode,
      assetName: asset.assetName,
      assetType: asset.assetType,
      disposalReason: disposal.disposalReason,
      disposalDate: dateToIsoDate(disposal.disposalDate),
      bookValueAtDisposal: d(disposal.bookValueAtDisposal),
      note: disposal.note,
      hasEvidence: Boolean(disposal.evidenceUrl),
      evidenceUrl: disposal.evidenceUrl,
    };
  },

  async listDisposals(
    userId: string,
    opts?: { page?: number; limit?: number },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where = { userId };

    const [rows, total, agg] = await Promise.all([
      prisma.assetDisposal.findMany({
        where,
        include: {
          asset: {
            select: { assetCode: true, assetName: true, assetType: true },
          },
        },
        orderBy: { disposalDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetDisposal.count({ where }),
      prisma.assetDisposal.aggregate({
        where,
        _sum: { bookValueAtDisposal: true },
      }),
    ]);

    return {
      summary: {
        totalDisposals: total,
        totalBookValueAtDisposal: normalizeMoneyAmount(
          d(agg._sum.bookValueAtDisposal),
        ),
      },
      disposals: rows.map((r) => ({
        id: r.id,
        disposalId: r.disposalCode,
        assetId: r.asset.assetCode,
        assetName: r.asset.assetName,
        assetType: r.asset.assetType,
        disposalReason: r.disposalReason,
        disposalDate: dateToIsoDate(r.disposalDate),
        bookValueAtDisposal: d(r.bookValueAtDisposal),
        note: r.note,
        hasEvidence: Boolean(r.evidenceUrl),
      })),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async updateDisposal(
    userId: string,
    disposalId: string,
    data: Partial<{
      disposalReason: string;
      disposalDate: string;
      note: string;
      evidenceUrl: string | null;
    }>,
  ) {
    const existing = await prisma.assetDisposal.findFirst({
      where: { id: disposalId, userId },
      include: {
        asset: {
          select: { assetCode: true, assetName: true, assetType: true },
        },
      },
    });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (data.disposalReason != null) {
      updateData.disposalReason = data.disposalReason;
    }
    if (data.disposalDate != null) {
      updateData.disposalDate = parseDateOnly(data.disposalDate);
    }
    if (data.note != null) updateData.note = data.note.trim();
    if (data.evidenceUrl !== undefined) {
      updateData.evidenceUrl = data.evidenceUrl?.trim() || null;
    }

    const updated =
      Object.keys(updateData).length === 0
        ? existing
        : await prisma.assetDisposal.update({
            where: { id: disposalId },
            data: updateData,
            include: {
              asset: {
                select: {
                  assetCode: true,
                  assetName: true,
                  assetType: true,
                },
              },
            },
          });

    return {
      id: updated.id,
      disposalId: updated.disposalCode,
      assetId: updated.asset.assetCode,
      assetName: updated.asset.assetName,
      assetType: updated.asset.assetType,
      disposalReason: updated.disposalReason,
      disposalDate: dateToIsoDate(updated.disposalDate),
      bookValueAtDisposal: d(updated.bookValueAtDisposal),
      note: updated.note,
      hasEvidence: Boolean(updated.evidenceUrl),
      evidenceUrl: updated.evidenceUrl,
    };
  },
};
