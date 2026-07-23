import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import {
  ASSET_HISTORY_ACTION_TYPES,
  CONSULTANT_REVIEW_STATUSES,
  isValidAssetHistoryActionType,
  isValidAssetType,
} from "../../constants/assets";
import { HttpReplyError } from "../../utils/httpReplyError";
import { MEDIA_CONFIG } from "../../config/s3";
import { uploadToS3 } from "../../services/mediaUploadService";
import {
  computeStraightLineDepreciation,
} from "./assetsService";
import { appendAssetHistory } from "./assetHistoryHelper";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function d(v: { toString(): string } | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function dateToIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function findOwnedAsset(userId: string, ref: string) {
  if (UUID_RE.test(ref)) {
    return prisma.asset.findFirst({ where: { id: ref, userId } });
  }
  return prisma.asset.findFirst({
    where: { userId, assetCode: ref },
  });
}

function consultantDisplayName(u: {
  firstName: string;
  lastName: string;
  organizationName: string | null;
}): string {
  const name = `${u.firstName} ${u.lastName}`.trim();
  return name || u.organizationName || "Consultant";
}

function mapHistoryDetails(
  type: string,
  details: Prisma.JsonValue,
): Record<string, unknown> {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  return {};
}

export const assetReviewsService = {
  async listReviews(
    userId: string,
    opts?: { page?: number; limit?: number },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);
    const where = {
      userId,
      assignToConsultant: true,
    };

    const [rows, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          history: {
            orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
      }),
      prisma.asset.count({ where }),
    ]);

    return {
      summary: { totalInReview: total },
      reviews: rows.map((a) => ({
        assetId: a.assetCode,
        assetName: a.assetName,
        assetType: a.assetType,
        consultantReviewStatus: a.consultantReviewStatus,
        lastActivity: a.history[0]
          ? dateToIsoDate(a.history[0].eventDate)
          : dateToIsoDate(a.updatedAt),
      })),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async getReviewDetail(userId: string, assetRef: string) {
    const asset = await findOwnedAsset(userId, assetRef);
    if (!asset) return null;
    if (!asset.assignToConsultant) {
      throw new HttpReplyError(
        400,
        "Asset is not flagged for consultant review",
      );
    }

    const [history, consultant] = await Promise.all([
      prisma.assetHistory.findMany({
        where: { assetId: asset.id, userId },
        orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
      }),
      asset.assignedConsultantId
        ? prisma.user.findUnique({
            where: { id: asset.assignedConsultantId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              organizationName: true,
            },
          })
        : null,
    ]);

    const cost = d(asset.purchaseCost);
    const dep = computeStraightLineDepreciation({
      purchaseCost: cost,
      purchaseDate: asset.purchaseDate,
      usefulLife: asset.usefulLife,
      residualValue: d(asset.residualValue),
    });
    const evidenceUrls =
      asset.evidenceUrls?.length > 0
        ? asset.evidenceUrls
        : asset.evidenceUrl
          ? [asset.evidenceUrl]
          : [];

    const lastActivity = history[0]
      ? dateToIsoDate(history[0].eventDate)
      : dateToIsoDate(asset.updatedAt);

    return {
      assetId: asset.assetCode,
      id: asset.id,
      assetName: asset.assetName,
      assetType: asset.assetType,
      purchaseCost: cost,
      bookValue: dep.bookValue,
      purchaseDate: dateToIsoDate(asset.purchaseDate),
      vendor: asset.vendor,
      depreciationMethod: asset.depreciationMethod,
      usefulLife: asset.usefulLife,
      remainingUsefulLife: dep.remainingUsefulLife,
      residualValue: asset.residualValue != null ? d(asset.residualValue) : null,
      accumulatedDepreciation: dep.accumulatedDepreciation,
      annualDepreciation: dep.annualDepreciation,
      serialNumber: asset.serialNumber,
      assetLocation: asset.assetLocation,
      additionalNote: asset.additionalNote,
      assignToConsultant: asset.assignToConsultant,
      assignedConsultantId: asset.assignedConsultantId,
      assignedConsultantName: consultant
        ? consultantDisplayName(consultant)
        : null,
      consultantReviewStatus: asset.consultantReviewStatus,
      evidenceUrls,
      lastActivity,
      nrsTreatment: {
        annualAllowanceRate: dep.depreciationPercentage || 20,
        taxDeductionThisYear: dep.annualDepreciation,
      },
      history: history.map((h) => ({
        type: h.type,
        date: dateToIsoDate(h.eventDate),
        details: mapHistoryDetails(h.type, h.details),
      })),
    };
  },

  async uploadEvidence(
    userId: string,
    assetRef: string,
    files: Express.Multer.File[],
  ) {
    const asset = await findOwnedAsset(userId, assetRef);
    if (!asset) throw new HttpReplyError(404, "Asset not found");
    if (!files?.length) {
      throw new HttpReplyError(
        400,
        "No files provided. Send multipart form with field 'files'.",
      );
    }

    const allowed = MEDIA_CONFIG.ALLOWED_FILE_TYPES as readonly string[];
    const urls: string[] = [];
    for (const file of files) {
      const mimetype = file.mimetype || "application/octet-stream";
      if (!allowed.includes(mimetype)) {
        throw new HttpReplyError(
          400,
          `File type not allowed for ${file.originalname}. Allowed: ${allowed.join(", ")}`,
        );
      }
      if (file.size > MEDIA_CONFIG.MAX_FILE_SIZE) {
        throw new HttpReplyError(
          400,
          `File too large (${file.originalname}). Max size: ${MEDIA_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
        );
      }
      const result = await uploadToS3({
        buffer: file.buffer,
        mimetype,
        originalName: file.originalname || "file",
        folder: "documents",
      });
      if (!result) {
        throw new HttpReplyError(
          500,
          "Upload failed. R2 may not be configured.",
        );
      }
      urls.push(result.url);
    }

    const merged = [...(asset.evidenceUrls ?? [])];
    for (const u of urls) {
      if (!merged.includes(u)) merged.push(u);
    }
    const updated = await prisma.asset.update({
      where: { id: asset.id },
      data: {
        evidenceUrls: merged,
        evidenceUrl: merged[0] ?? null,
      },
    });

    return {
      assetId: updated.assetCode,
      evidenceUrls: updated.evidenceUrls,
    };
  },

  async assignConsultant(
    userId: string,
    assetRef: string,
    consultantId: string,
  ) {
    const asset = await findOwnedAsset(userId, assetRef);
    if (!asset) throw new HttpReplyError(404, "Asset not found");

    const consultant = await prisma.user.findFirst({
      where: {
        id: consultantId,
        enterpriseOnboardingComplete: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        organizationName: true,
      },
    });
    if (!consultant) {
      throw new HttpReplyError(400, "Consultant not found or not available");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.asset.update({
        where: { id: asset.id },
        data: {
          assignToConsultant: true,
          assignedConsultantId: consultant.id,
          consultantReviewStatus: CONSULTANT_REVIEW_STATUSES[0],
        },
      });
      await appendAssetHistory(tx, {
        userId,
        assetId: asset.id,
        type: "SENT_TO_CONSULTANT",
        details: {
          consultantName: consultantDisplayName(consultant),
          consultantId: consultant.id,
        },
      });
      return row;
    });

    return {
      assetId: updated.assetCode,
      assignToConsultant: updated.assignToConsultant,
      consultantId: updated.assignedConsultantId,
      consultantReviewStatus: updated.consultantReviewStatus,
    };
  },

  /**
   * Distinct step: consultant acknowledges receipt before completing review.
   * Logs CONFIRM_REVIEW; status stays PENDING until approve.
   */
  async confirmReview(userId: string, assetRef: string) {
    const asset = await findOwnedAsset(userId, assetRef);
    if (!asset) throw new HttpReplyError(404, "Asset not found");
    if (!asset.assignToConsultant || !asset.assignedConsultantId) {
      throw new HttpReplyError(
        400,
        "Assign a consultant before confirming review",
      );
    }
    if (asset.consultantReviewStatus === CONSULTANT_REVIEW_STATUSES[1]) {
      throw new HttpReplyError(400, "Review is already approved");
    }

    const consultant = await prisma.user.findUnique({
      where: { id: asset.assignedConsultantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        organizationName: true,
      },
    });

    await appendAssetHistory(prisma, {
      userId,
      assetId: asset.id,
      type: "CONFIRM_REVIEW",
      details: {
        consultantName: consultant
          ? consultantDisplayName(consultant)
          : "Consultant",
        consultantId: asset.assignedConsultantId,
      },
    });

    return {
      assetId: asset.assetCode,
      consultantReviewStatus: asset.consultantReviewStatus,
      confirmed: true,
    };
  },

  async approveReview(userId: string, assetRef: string) {
    const asset = await findOwnedAsset(userId, assetRef);
    if (!asset) throw new HttpReplyError(404, "Asset not found");
    if (!asset.assignToConsultant) {
      throw new HttpReplyError(400, "Asset is not in consultant review");
    }

    const consultant = asset.assignedConsultantId
      ? await prisma.user.findUnique({
          where: { id: asset.assignedConsultantId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            organizationName: true,
          },
        })
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.asset.update({
        where: { id: asset.id },
        data: {
          consultantReviewStatus: CONSULTANT_REVIEW_STATUSES[1],
        },
      });
      await appendAssetHistory(tx, {
        userId,
        assetId: asset.id,
        type: "CONSULTANT_APPROVED",
        details: {
          consultantName: consultant
            ? consultantDisplayName(consultant)
            : "Consultant",
          consultantId: asset.assignedConsultantId,
        },
      });
      return row;
    });

    return {
      assetId: updated.assetCode,
      consultantReviewStatus: updated.consultantReviewStatus,
    };
  },

  async listConsultants(userId: string) {
    const active = await prisma.consultantConnection.findMany({
      where: { userId, status: "active" },
      select: { consultantUserId: true },
    });
    const connectedIds = active.map((c) => c.consultantUserId);

    const where: Prisma.UserWhereInput = {
      enterpriseOnboardingComplete: true,
      id: { not: userId },
      ...(connectedIds.length > 0
        ? {
            OR: [
              { id: { in: connectedIds } },
              { enterpriseOnboardingComplete: true },
            ],
          }
        : {}),
    };

    // Prefer connected consultants; also include other onboarded consultants for assignment.
    const users = await prisma.user.findMany({
      where: {
        enterpriseOnboardingComplete: true,
        id: { not: userId },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        organizationName: true,
      },
      orderBy: [{ organizationName: "asc" }, { email: "asc" }],
      take: 100,
    });

    const connectedSet = new Set(connectedIds);
    const sorted = [...users].sort((a, b) => {
      const ac = connectedSet.has(a.id) ? 0 : 1;
      const bc = connectedSet.has(b.id) ? 0 : 1;
      return ac - bc;
    });

    void where;
    return {
      consultants: sorted.map((u) => ({
        consultantId: u.id,
        name: consultantDisplayName(u),
        email: u.email,
        phone: u.phone,
        organizationName: u.organizationName,
        connected: connectedSet.has(u.id),
      })),
    };
  },

  async listAllHistory(
    userId: string,
    opts?: {
      page?: number;
      limit?: number;
      assetType?: string;
      type?: string;
      assetId?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);

    if (opts?.type && !isValidAssetHistoryActionType(opts.type)) {
      throw new HttpReplyError(
        400,
        `Invalid history type. Allowed: ${ASSET_HISTORY_ACTION_TYPES.join(", ")}`,
      );
    }
    if (opts?.assetType && !isValidAssetType(opts.assetType)) {
      throw new HttpReplyError(400, "Invalid assetType");
    }

    let assetDbId: string | undefined;
    if (opts?.assetId) {
      const asset = await findOwnedAsset(userId, opts.assetId);
      if (!asset) {
        return {
          summary: { totalRecords: 0 },
          history: [],
          pagination: {
            page,
            limit,
            totalRecords: 0,
            totalPages: 1,
          },
        };
      }
      assetDbId = asset.id;
    }

    const where: Prisma.AssetHistoryWhereInput = {
      userId,
      ...(opts?.type ? { type: opts.type } : {}),
      ...(assetDbId ? { assetId: assetDbId } : {}),
      ...(opts?.dateFrom || opts?.dateTo
        ? {
            eventDate: {
              ...(opts.dateFrom ? { gte: opts.dateFrom } : {}),
              ...(opts.dateTo ? { lte: opts.dateTo } : {}),
            },
          }
        : {}),
      ...(opts?.assetType
        ? { asset: { assetType: opts.assetType } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.assetHistory.findMany({
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
        orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.assetHistory.count({ where }),
    ]);

    return {
      summary: { totalRecords: total },
      history: rows.map((h) => ({
        assetId: h.asset.assetCode,
        assetName: h.asset.assetName,
        assetType: h.asset.assetType,
        type: h.type,
        date: dateToIsoDate(h.eventDate),
        details: mapHistoryDetails(h.type, h.details),
      })),
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },
};
