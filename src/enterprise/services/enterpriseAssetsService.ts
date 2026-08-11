import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  ASSET_STATUS,
  CONSULTANT_REVIEW_STATUS,
  CONSULTANT_REVIEW_OPEN_STATUSES,
} from "../../constants/assets";
import { computeAssetDepreciation } from "../../constants/assetDepreciation";
import {
  ASSET_TYPE_TO_CLASSIFICATION,
  CLASSIFICATION_TO_ASSET_TYPE,
  INTERNAL_DEP_METHOD_TO_ENTERPRISE,
  normalizeEnterpriseClassification,
  normalizeEnterpriseDepMethod,
} from "../../constants/enterpriseAssets";
import { PERCENT } from "../../constants/percentages";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { appendAssetHistory } from "../../mobile/services/assetHistoryHelper";
import { assetReportsService } from "../../mobile/services/assetReportsService";
import { assetEventBus } from "./assetEventBus";

type AssetRow = Awaited<ReturnType<typeof prisma.asset.findFirst>> & object;

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function dateIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function actorName(u: {
  firstName?: string | null;
  lastName?: string | null;
  organizationName?: string | null;
  email?: string | null;
}): string {
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name || u.organizationName || u.email || "User";
}

function depFor(asset: {
  purchaseCost: Decimal;
  purchaseDate: Date;
  depreciationMethod: string | null;
  usefulLife: number | null;
  residualValue: Decimal | null;
  depreciationRate: Decimal | null;
  totalEstimatedUnit: Decimal | null;
  unitProduced: Decimal | null;
}) {
  return computeAssetDepreciation({
    purchaseCost: d(asset.purchaseCost),
    purchaseDate: asset.purchaseDate,
    depreciationMethod: asset.depreciationMethod,
    usefulLife: asset.usefulLife,
    residualValue: asset.residualValue != null ? d(asset.residualValue) : null,
    depreciationRate:
      asset.depreciationRate != null ? d(asset.depreciationRate) : null,
    totalEstimatedUnit:
      asset.totalEstimatedUnit != null ? d(asset.totalEstimatedUnit) : null,
    unitProduced: asset.unitProduced != null ? d(asset.unitProduced) : null,
  });
}

function submissionStatus(asset: {
  consultantReviewStatus: string | null;
  status: string;
}): "pending" | "approved" | "returned" {
  if (asset.consultantReviewStatus === CONSULTANT_REVIEW_STATUS.REJECTED) {
    return "returned";
  }
  if (asset.consultantReviewStatus === CONSULTANT_REVIEW_STATUS.APPROVED) {
    return "approved";
  }
  return "pending";
}

function registeredStatus(asset: {
  status: string;
  purchaseCost: Decimal;
  residualValue: Decimal | null;
}, bookValue: number): "active" | "disposed" | "fully-depreciated" {
  if (asset.status === ASSET_STATUS.DISPOSED || asset.status === ASSET_STATUS.SOLD) {
    return "disposed";
  }
  const residual = asset.residualValue != null ? d(asset.residualValue) : 0;
  const cost = d(asset.purchaseCost);
  if (cost > 0 && bookValue <= residual + 0.01) return "fully-depreciated";
  return "active";
}

function isPendingReviewAsset(asset: {
  assignToConsultant: boolean;
  consultantReviewStatus: string | null;
}): boolean {
  if (!asset.assignToConsultant) return false;
  const s = asset.consultantReviewStatus;
  return (
    !s ||
    (CONSULTANT_REVIEW_OPEN_STATUSES as readonly string[]).includes(s) ||
    s === CONSULTANT_REVIEW_STATUS.REJECTED
  );
}

async function findClientAsset(userId: string, assetId: string) {
  return prisma.asset.findFirst({
    where: {
      userId,
      OR: [{ id: assetId }, { assetCode: assetId }],
    },
  });
}

async function latestReturnReason(assetId: string): Promise<string | null> {
  const row = await prisma.assetHistory.findFirst({
    where: { assetId, type: "RETURNED_TO_OWNER" },
    orderBy: { createdAt: "desc" },
  });
  if (!row?.details || typeof row.details !== "object") return null;
  const details = row.details as Record<string, unknown>;
  return typeof details.reason === "string" ? details.reason : null;
}

function mapSubmission(asset: NonNullable<AssetRow>, returnReason: string | null) {
  const status = submissionStatus(asset);
  const evidence =
    (asset.evidenceUrls?.length ?? 0) > 0 || Boolean(asset.evidenceUrl?.trim());
  return {
    id: asset.id,
    name: asset.assetName,
    submitted_type:
      ASSET_TYPE_TO_CLASSIFICATION[asset.assetType] ?? asset.assetType,
    cost: d(asset.purchaseCost),
    purchase_date: dateIso(asset.purchaseDate),
    submitted_at: asset.createdAt.toISOString(),
    evidence_attached: evidence,
    owner_notes: asset.additionalNote,
    status,
    return_reason: status === "returned" ? returnReason : null,
    returned_at:
      status === "returned" ? asset.updatedAt.toISOString() : null,
  };
}

function mapRegisteredListItem(asset: NonNullable<AssetRow>) {
  const dep = depFor(asset);
  const cost = d(asset.purchaseCost);
  return {
    id: asset.id,
    name: asset.assetName,
    location: asset.assetLocation ?? "",
    classification:
      ASSET_TYPE_TO_CLASSIFICATION[asset.assetType] ?? asset.assetType,
    cost,
    depreciation_method:
      INTERNAL_DEP_METHOD_TO_ENTERPRISE[asset.depreciationMethod ?? ""] ??
      "straight-line",
    annual_depreciation: dep.annualDepreciation,
    net_book_value: dep.bookValue,
    nbv_percentage:
      cost > 0
        ? normalizeMoneyAmount((dep.bookValue / cost) * PERCENT)
        : 0,
    accumulated_depreciation: dep.accumulatedDepreciation,
    status: registeredStatus(asset, dep.bookValue),
  };
}

function mapRegisteredDetail(asset: NonNullable<AssetRow>) {
  const dep = depFor(asset);
  const cost = d(asset.purchaseCost);
  const startYear = asset.purchaseDate.getUTCFullYear();
  return {
    id: asset.id,
    name: asset.assetName,
    location: asset.assetLocation ?? "",
    assigned_employee: null as string | null,
    classification:
      ASSET_TYPE_TO_CLASSIFICATION[asset.assetType] ?? asset.assetType,
    cost,
    purchase_date: dateIso(asset.purchaseDate),
    depreciation_start_year: startYear,
    useful_life_years: asset.usefulLife,
    residual_value: asset.residualValue != null ? d(asset.residualValue) : 0,
    depreciation_method:
      asset.assetType === "SOFTWARE_LICENSES"
        ? null
        : INTERNAL_DEP_METHOD_TO_ENTERPRISE[asset.depreciationMethod ?? ""] ??
          "straight-line",
    amortisation_method:
      asset.assetType === "SOFTWARE_LICENSES"
        ? INTERNAL_DEP_METHOD_TO_ENTERPRISE[asset.depreciationMethod ?? ""] ??
          "straight-line"
        : null,
    asset_notes: asset.additionalNote ?? "",
    consultant_notes: null as string | null,
    annual_depreciation: dep.annualDepreciation,
    net_book_value: dep.bookValue,
    nbv_percentage:
      cost > 0
        ? normalizeMoneyAmount((dep.bookValue / cost) * PERCENT)
        : 0,
    accumulated_depreciation: dep.accumulatedDepreciation,
    status: registeredStatus(asset, dep.bookValue),
    approved_at: asset.updatedAt.toISOString(),
  };
}

/** Short-lived download tokens (in-memory). */
const downloadCache = new Map<
  string,
  { buffer: Buffer; filename: string; contentType: string; expiresAt: number }
>();

function putDownload(
  buffer: Buffer,
  filename: string,
  contentType: string,
): { id: string; expires_at: string } {
  const id = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const expiresAt = Date.now() + 60 * 60 * 1000;
  downloadCache.set(id, { buffer, filename, contentType, expiresAt });
  return { id, expires_at: new Date(expiresAt).toISOString() };
}

export function takeDownload(id: string) {
  const row = downloadCache.get(id);
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    downloadCache.delete(id);
    return null;
  }
  return row;
}

function buildYearSchedule(asset: NonNullable<AssetRow>) {
  const cost = d(asset.purchaseCost);
  const residual = asset.residualValue != null ? d(asset.residualValue) : 0;
  const life = asset.usefulLife && asset.usefulLife > 0 ? asset.usefulLife : 1;
  const method = asset.depreciationMethod ?? "STRAIGHT_LINE";
  const startYear = asset.purchaseDate.getUTCFullYear();
  const schedule: Array<{
    year_number: number;
    calendar_year: number;
    opening_nbv: number;
    depreciation: number;
    closing_nbv: number;
  }> = [];

  let opening = cost;
  for (let y = 1; y <= life; y++) {
    const asOf = new Date(Date.UTC(startYear + y, 0, 1));
    const dep = computeAssetDepreciation({
      purchaseCost: cost,
      purchaseDate: asset.purchaseDate,
      depreciationMethod: method,
      usefulLife: life,
      residualValue: residual,
      depreciationRate:
        asset.depreciationRate != null ? d(asset.depreciationRate) : null,
      totalEstimatedUnit:
        asset.totalEstimatedUnit != null ? d(asset.totalEstimatedUnit) : null,
      unitProduced: asset.unitProduced != null ? d(asset.unitProduced) : null,
      asOf,
    });
    const prevAsOf = new Date(Date.UTC(startYear + y - 1, 0, 1));
    const prev =
      y === 1
        ? { bookValue: cost, accumulatedDepreciation: 0 }
        : computeAssetDepreciation({
            purchaseCost: cost,
            purchaseDate: asset.purchaseDate,
            depreciationMethod: method,
            usefulLife: life,
            residualValue: residual,
            depreciationRate:
              asset.depreciationRate != null ? d(asset.depreciationRate) : null,
            totalEstimatedUnit:
              asset.totalEstimatedUnit != null
                ? d(asset.totalEstimatedUnit)
                : null,
            unitProduced:
              asset.unitProduced != null ? d(asset.unitProduced) : null,
            asOf: prevAsOf,
          });
    const openingNbv = y === 1 ? cost : prev.bookValue;
    const closingNbv = dep.bookValue;
    const yearDep = normalizeMoneyAmount(
      Math.max(0, openingNbv - closingNbv),
    );
    schedule.push({
      year_number: y,
      calendar_year: startYear + y - 1,
      opening_nbv: normalizeMoneyAmount(openingNbv),
      depreciation: yearDep,
      closing_nbv: normalizeMoneyAmount(closingNbv),
    });
    if (closingNbv <= residual + 0.01) break;
  }

  const current = depFor(asset);
  return {
    asset: {
      id: asset.id,
      name: asset.assetName,
      cost,
      depreciation_method:
        INTERNAL_DEP_METHOD_TO_ENTERPRISE[method] ?? "straight-line",
      useful_life_years: life,
      residual_value: residual,
      depreciation_start_year: startYear,
      current_nbv: current.bookValue,
      depreciated_pct:
        cost > 0
          ? normalizeMoneyAmount(
              (current.accumulatedDepreciation / cost) * PERCENT,
            )
          : 0,
    },
    schedule,
  };
}

function mapHistoryEvent(
  h: {
    id: string;
    assetId: string;
    type: string;
    details: unknown;
    createdAt: Date;
  },
  assetName: string,
) {
  const details =
    h.details && typeof h.details === "object" && !Array.isArray(h.details)
      ? (h.details as Record<string, unknown>)
      : {};

  let event_type = "submitted";
  let actor_type: "business_owner" | "consultant" = "business_owner";
  let description =
    typeof details.description === "string"
      ? details.description
      : "Asset event recorded.";

  switch (h.type) {
    case "ASSET_ACQUIRED":
    case "SENT_TO_CONSULTANT":
      event_type = "submitted";
      actor_type = "business_owner";
      description =
        typeof details.description === "string"
          ? details.description
          : "Asset submitted for consultant review via FileAm Mobile.";
      break;
    case "CONSULTANT_APPROVED":
      event_type = "approved";
      actor_type = "consultant";
      description =
        typeof details.description === "string"
          ? details.description
          : "Asset approved and registered by consultant.";
      break;
    case "RETURNED_TO_OWNER":
      event_type = "returned";
      actor_type = "consultant";
      description =
        typeof details.description === "string"
          ? details.description
          : "Asset returned to owner for clarification.";
      break;
    case "FIELD_EDITED":
      event_type = "field_edited";
      actor_type = "consultant";
      description =
        typeof details.description === "string"
          ? details.description
          : "Asset fields updated.";
      break;
    case "EXPENSE_CLASSIFIED":
      event_type = "approved";
      actor_type = "consultant";
      description =
        typeof details.description === "string"
          ? details.description
          : "Asset classified as Expense (not registered as a fixed asset).";
      break;
    default:
      break;
  }

  return {
    id: h.id,
    asset_id: h.assetId,
    asset_name: assetName,
    event_type,
    actor_name:
      typeof details.actorName === "string"
        ? details.actorName
        : typeof details.consultantName === "string"
          ? details.consultantName
          : actor_type === "consultant"
            ? "Consultant"
            : "Business Owner",
    actor_type,
    description,
    changed_fields:
      details.changed_fields && typeof details.changed_fields === "object"
        ? details.changed_fields
        : null,
    reason: typeof details.reason === "string" ? details.reason : null,
    created_at: h.createdAt.toISOString(),
  };
}

export const enterpriseAssetsService = {
  async listPending(
    userId: string,
    filters?: { status?: string },
  ) {
    const assets = await prisma.asset.findMany({
      where: {
        userId,
        assignToConsultant: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const mapped = [];
    let awaiting = 0;
    let returned = 0;
    let approved = 0;

    for (const a of assets) {
      if (
        a.consultantReviewStatus === CONSULTANT_REVIEW_STATUS.APPROVED &&
        a.status === ASSET_STATUS.DISPOSED
      ) {
        // expense-classified still counts as approved submission
      }
      const status = submissionStatus(a);
      if (status === "pending") awaiting += 1;
      else if (status === "returned") returned += 1;
      else approved += 1;

      if (filters?.status && filters.status !== status) continue;
      // pending list includes all review-pipeline assets; filter optional
      if (!filters?.status && status === "approved" && !isPendingReviewAsset(a)) {
        // still include approved in summary but list defaults to all when no filter
      }

      const reason =
        status === "returned" ? await latestReturnReason(a.id) : null;
      mapped.push(mapSubmission(a, reason));
    }

    let list = mapped;
    if (filters?.status) {
      list = mapped.filter((m) => m.status === filters.status);
    }

    return {
      summary: {
        awaiting,
        returned,
        approved,
        total: awaiting + returned + approved,
      },
      assets: list,
    };
  },

  async getPending(userId: string, assetId: string) {
    const asset = await findClientAsset(userId, assetId);
    if (!asset || !asset.assignToConsultant) {
      throw new HttpReplyError(404, "Pending asset submission not found");
    }
    const reason = await latestReturnReason(asset.id);
    return mapSubmission(asset, reason);
  },

  async approve(
    userId: string,
    clientId: string,
    assetId: string,
    consultantUserId: string,
    body: {
      classification: string;
      useful_life_years?: number;
      residual_value?: number;
      depreciation_method?: string;
      amortisation_method?: string;
      consultant_notes?: string;
    },
  ) {
    const classification = normalizeEnterpriseClassification(body.classification);
    if (!classification) {
      throw new HttpReplyError(422, "Invalid classification");
    }
    if (classification === "Expense") {
      throw new HttpReplyError(
        422,
        'Use POST /assets/:assetId/expense for Expense classification',
      );
    }

    const assetType = CLASSIFICATION_TO_ASSET_TYPE[classification];
    if (!assetType) throw new HttpReplyError(422, "Invalid classification");

    const isSoftware = classification === "Software License";
    const methodRaw = isSoftware
      ? body.amortisation_method ?? body.depreciation_method
      : body.depreciation_method;
    const method = normalizeEnterpriseDepMethod(methodRaw);
    if (!method) {
      throw new HttpReplyError(
        422,
        isSoftware
          ? "amortisation_method is required for Software License"
          : "depreciation_method is required",
      );
    }
    if (body.useful_life_years == null || body.useful_life_years < 1) {
      throw new HttpReplyError(422, "useful_life_years is required (min 1)");
    }
    if (body.residual_value == null || body.residual_value < 0) {
      throw new HttpReplyError(422, "residual_value is required (>= 0)");
    }

    const asset = await findClientAsset(userId, assetId);
    if (!asset || !asset.assignToConsultant) {
      throw new HttpReplyError(404, "Asset submission not found");
    }
    if (asset.consultantReviewStatus === CONSULTANT_REVIEW_STATUS.APPROVED) {
      throw new HttpReplyError(400, "Asset is already approved");
    }

    const consultant = await prisma.user.findUnique({
      where: { id: consultantUserId },
      select: {
        firstName: true,
        lastName: true,
        organizationName: true,
        email: true,
      },
    });

    const description = `Asset approved as ${classification} (${INTERNAL_DEP_METHOD_TO_ENTERPRISE[method]}).`;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({
        where: { id: asset.id },
        data: {
          assetType,
          usefulLife: body.useful_life_years,
          residualValue: new Decimal(body.residual_value!),
          depreciationMethod: method,
          consultantReviewStatus: CONSULTANT_REVIEW_STATUS.APPROVED,
          status: ASSET_STATUS.ACTIVE,
          additionalNote: body.consultant_notes?.trim()
            ? body.consultant_notes.trim()
            : asset.additionalNote,
        },
      });

      const history = await appendAssetHistory(tx, {
        userId,
        assetId: asset.id,
        type: "CONSULTANT_APPROVED",
        details: {
          description,
          actorName: consultant ? actorName(consultant) : "Consultant",
          consultantId: consultantUserId,
          classification,
          consultant_notes: body.consultant_notes ?? null,
        },
      });

      return { updated, history };
    });

    assetEventBus.publish({
      type: "asset.approved",
      userId,
      assetId: asset.id,
      clientId,
    });

    return {
      success: true,
      registered_asset_id: result.updated.id,
      audit_event_id: result.history.id,
      notification_sent: false,
    };
  },

  async returnToOwner(
    userId: string,
    clientId: string,
    assetId: string,
    consultantUserId: string,
    reason: string,
  ) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new HttpReplyError(422, "reason is required");

    const asset = await findClientAsset(userId, assetId);
    if (!asset || !asset.assignToConsultant) {
      throw new HttpReplyError(404, "Asset submission not found");
    }

    const consultant = await prisma.user.findUnique({
      where: { id: consultantUserId },
      select: {
        firstName: true,
        lastName: true,
        organizationName: true,
        email: true,
      },
    });

    const description = `Asset returned to owner: ${trimmed}`;

    const history = await prisma.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          consultantReviewStatus: CONSULTANT_REVIEW_STATUS.REJECTED,
          status: ASSET_STATUS.AWAITING,
        },
      });
      return appendAssetHistory(tx, {
        userId,
        assetId: asset.id,
        type: "RETURNED_TO_OWNER",
        details: {
          description,
          reason: trimmed,
          actorName: consultant ? actorName(consultant) : "Consultant",
          consultantId: consultantUserId,
        },
      });
    });

    assetEventBus.publish({
      type: "asset.returned",
      userId,
      assetId: asset.id,
      clientId,
    });

    return {
      success: true,
      audit_event_id: history.id,
      notification_sent: false,
    };
  },

  async classifyAsExpense(
    userId: string,
    clientId: string,
    assetId: string,
    consultantUserId: string,
    consultantNotes?: string,
  ) {
    const asset = await findClientAsset(userId, assetId);
    if (!asset || !asset.assignToConsultant) {
      throw new HttpReplyError(404, "Asset submission not found");
    }

    const consultant = await prisma.user.findUnique({
      where: { id: consultantUserId },
      select: {
        firstName: true,
        lastName: true,
        organizationName: true,
        email: true,
      },
    });

    const description =
      "Asset classified as Expense — not registered as a fixed asset.";

    const history = await prisma.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          consultantReviewStatus: CONSULTANT_REVIEW_STATUS.APPROVED,
          status: ASSET_STATUS.DISPOSED,
          additionalNote: consultantNotes?.trim() || asset.additionalNote,
        },
      });
      return appendAssetHistory(tx, {
        userId,
        assetId: asset.id,
        type: "EXPENSE_CLASSIFIED",
        details: {
          description,
          actorName: consultant ? actorName(consultant) : "Consultant",
          consultantId: consultantUserId,
          consultant_notes: consultantNotes ?? null,
          expenseTreatment: true,
        },
      });
    });

    assetEventBus.publish({
      type: "asset.expense_classified",
      userId,
      assetId: asset.id,
      clientId,
    });

    return {
      success: true,
      audit_event_id: history.id,
      notification_sent: false,
      registered_asset_id: null,
    };
  },

  async listRegister(userId: string, search?: string) {
    const assets = await prisma.asset.findMany({
      where: {
        userId,
        consultantReviewStatus: CONSULTANT_REVIEW_STATUS.APPROVED,
        status: {
          in: [ASSET_STATUS.ACTIVE, ASSET_STATUS.SOLD, ASSET_STATUS.DISPOSED],
        },
      },
      orderBy: { assetName: "asc" },
    });

    // Exclude expense-classified (DISPOSED + expense history)
    const expenseIds = new Set(
      (
        await prisma.assetHistory.findMany({
          where: { userId, type: "EXPENSE_CLASSIFIED" },
          select: { assetId: true },
        })
      ).map((h) => h.assetId),
    );

    let rows = assets.filter((a) => !expenseIds.has(a.id));
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((a) => a.assetName.toLowerCase().includes(q));
    }

    const mapped = rows.map(mapRegisteredListItem);
    const totalCost = normalizeMoneyAmount(
      mapped.reduce((s, a) => s + a.cost, 0),
    );
    const totalNbv = normalizeMoneyAmount(
      mapped.reduce((s, a) => s + a.net_book_value, 0),
    );
    const accumulated = normalizeMoneyAmount(
      mapped.reduce((s, a) => s + a.accumulated_depreciation, 0),
    );

    return {
      summary: {
        total_asset_cost: totalCost,
        total_nbv: totalNbv,
        accumulated_depreciation: accumulated,
        asset_count: mapped.length,
      },
      assets: mapped.map(
        ({ accumulated_depreciation: _a, ...rest }) => rest,
      ),
    };
  },

  async getRegister(userId: string, assetId: string) {
    const asset = await findClientAsset(userId, assetId);
    if (
      !asset ||
      asset.consultantReviewStatus !== CONSULTANT_REVIEW_STATUS.APPROVED
    ) {
      throw new HttpReplyError(404, "Registered asset not found");
    }
    const expense = await prisma.assetHistory.findFirst({
      where: { assetId: asset.id, type: "EXPENSE_CLASSIFIED" },
    });
    if (expense) throw new HttpReplyError(404, "Registered asset not found");
    return mapRegisteredDetail(asset);
  },

  async patchRegister(
    userId: string,
    clientId: string,
    assetId: string,
    consultantUserId: string,
    body: {
      name?: string;
      location?: string;
      assigned_employee?: string | null;
      useful_life_years?: number;
      residual_value?: number;
      asset_notes?: string;
      reason_for_change: string;
    },
  ) {
    const reason = body.reason_for_change?.trim();
    if (!reason) {
      throw new HttpReplyError(422, "reason_for_change is required");
    }

    const asset = await findClientAsset(userId, assetId);
    if (
      !asset ||
      asset.consultantReviewStatus !== CONSULTANT_REVIEW_STATUS.APPROVED
    ) {
      throw new HttpReplyError(404, "Registered asset not found");
    }

    const changed: Record<string, { from: unknown; to: unknown }> = {};
    const data: Record<string, unknown> = {};

    if (body.name != null && body.name.trim() !== asset.assetName) {
      changed.name = { from: asset.assetName, to: body.name.trim() };
      data.assetName = body.name.trim();
    }
    if (
      body.location != null &&
      body.location !== (asset.assetLocation ?? "")
    ) {
      changed.location = {
        from: asset.assetLocation,
        to: body.location,
      };
      data.assetLocation = body.location;
    }
    if (
      body.useful_life_years != null &&
      body.useful_life_years !== asset.usefulLife
    ) {
      changed.useful_life_years = {
        from: asset.usefulLife,
        to: body.useful_life_years,
      };
      data.usefulLife = body.useful_life_years;
    }
    if (
      body.residual_value != null &&
      body.residual_value !== d(asset.residualValue)
    ) {
      changed.residual_value = {
        from: d(asset.residualValue),
        to: body.residual_value,
      };
      data.residualValue = new Decimal(body.residual_value);
    }
    if (
      body.asset_notes != null &&
      body.asset_notes !== (asset.additionalNote ?? "")
    ) {
      changed.asset_notes = {
        from: asset.additionalNote,
        to: body.asset_notes,
      };
      data.additionalNote = body.asset_notes;
    }

    if (Object.keys(changed).length === 0) {
      return {
        success: true,
        asset: mapRegisteredDetail(asset),
        audit_event_id: null,
      };
    }

    const consultant = await prisma.user.findUnique({
      where: { id: consultantUserId },
      select: {
        firstName: true,
        lastName: true,
        organizationName: true,
        email: true,
      },
    });

    const fieldLabels = Object.keys(changed)
      .map((k) => {
        const c = changed[k]!;
        return `${k} changed from ${String(c.from)} → ${String(c.to)}`;
      })
      .join("; ");
    const description = fieldLabels.endsWith(".")
      ? fieldLabels
      : `${fieldLabels}.`;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({
        where: { id: asset.id },
        data,
      });
      const history = await appendAssetHistory(tx, {
        userId,
        assetId: asset.id,
        type: "FIELD_EDITED",
        details: {
          description,
          reason,
          actorName: consultant ? actorName(consultant) : "Consultant",
          consultantId: consultantUserId,
          changed_fields: changed,
          assigned_employee: body.assigned_employee ?? null,
        },
      });
      return { updated, history };
    });

    assetEventBus.publish({
      type: "asset.updated",
      userId,
      assetId: asset.id,
      clientId,
    });

    return {
      success: true,
      asset: mapRegisteredDetail(result.updated),
      audit_event_id: result.history.id,
    };
  },

  async exportRegister(
    userId: string,
    clientId: string,
    format: string,
  ) {
    if (format !== "pdf" && format !== "excel") {
      throw new HttpReplyError(422, 'format must be "pdf" or "excel"');
    }
    const pdf = await assetReportsService.generatePdf(
      userId,
      "ASSET_SUMMARY_REPORT",
      {},
    );
    const filename =
      format === "excel"
        ? `asset-register-${dateIso(new Date())}.csv`
        : pdf.filename.replace(/\.pdf$/i, "") + ".pdf";

    let buffer = pdf.buffer;
    let contentType = "application/pdf";
    if (format === "excel") {
      const reg = await this.listRegister(userId);
      const lines = [
        "Name,Location,Classification,Cost,NBV,Annual Depreciation,Status",
        ...reg.assets.map(
          (a) =>
            `"${a.name.replace(/"/g, '""')}","${(a.location || "").replace(/"/g, '""')}",${a.classification},${a.cost},${a.net_book_value},${a.annual_depreciation},${a.status}`,
        ),
      ];
      buffer = Buffer.from(lines.join("\n"), "utf8");
      contentType = "text/csv";
    }

    const { id, expires_at } = putDownload(buffer, filename, contentType);
    const apiVersion = process.env.API_VERSION || "1";
    return {
      download_url: `/api/v${apiVersion}/enterprise/clients/${clientId}/assets/downloads/${id}`,
      filename,
      expires_at,
    };
  },

  async getDepreciationSchedule(userId: string, assetId: string) {
    const asset = await findClientAsset(userId, assetId);
    if (
      !asset ||
      asset.consultantReviewStatus !== CONSULTANT_REVIEW_STATUS.APPROVED
    ) {
      throw new HttpReplyError(404, "Registered asset not found");
    }
    return buildYearSchedule(asset);
  },

  async listHistory(
    userId: string,
    opts?: {
      asset_id?: string;
      event_type?: string;
      page?: number;
      per_page?: number;
    },
  ) {
    const page = Math.max(1, opts?.page ?? 1);
    const perPage = Math.min(200, Math.max(1, opts?.per_page ?? 50));

    const assets = await prisma.asset.findMany({
      where: { userId },
      select: { id: true, assetName: true },
    });
    const nameById = new Map(assets.map((a) => [a.id, a.assetName]));

    const history = await prisma.assetHistory.findMany({
      where: {
        userId,
        ...(opts?.asset_id ? { assetId: opts.asset_id } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    let events = history.map((h) =>
      mapHistoryEvent(h, nameById.get(h.assetId) ?? "Asset"),
    );
    if (opts?.event_type) {
      events = events.filter((e) => e.event_type === opts.event_type);
    }

    const total = events.length;
    const slice = events.slice((page - 1) * perPage, page * perPage);

    return {
      events: slice,
      pagination: {
        total,
        page,
        per_page: perPage,
      },
    };
  },

  async generateReport(
    userId: string,
    clientId: string,
    body: {
      report_type: string;
      format: string;
      date_from?: string;
      date_to?: string;
    },
  ) {
    const typeMap: Record<string, string> = {
      register_summary: "ASSET_SUMMARY_REPORT",
      depreciation_schedule: "DEPRECIATION_SCHEDULE",
      asset_movement: "ASSET_MOVEMENT_REPORT",
      audit_trail: "ASSET_SUMMARY_REPORT",
    };
    const reportType = typeMap[body.report_type];
    if (!reportType) {
      throw new HttpReplyError(
        422,
        "report_type must be register_summary | depreciation_schedule | asset_movement | audit_trail",
      );
    }
    if (body.format !== "pdf" && body.format !== "excel") {
      throw new HttpReplyError(422, 'format must be "pdf" or "excel"');
    }
    if (body.report_type === "audit_trail" && body.format !== "pdf") {
      throw new HttpReplyError(422, "audit_trail is PDF only");
    }

    const filters = {
      startDate: body.date_from ? new Date(body.date_from) : undefined,
      endDate: body.date_to ? new Date(body.date_to) : undefined,
    };

    if (body.report_type === "audit_trail") {
      const pdf = await assetReportsService.generatePdf(
        userId,
        "ASSET_SUMMARY_REPORT",
        filters,
      );
      const { id, expires_at } = putDownload(
        pdf.buffer,
        `audit-trail-${dateIso(new Date())}.pdf`,
        "application/pdf",
      );
      const apiVersion = process.env.API_VERSION || "1";
      return {
        download_url: `/api/v${apiVersion}/enterprise/clients/${clientId}/assets/downloads/${id}`,
        filename: `audit-trail-${dateIso(new Date())}.pdf`,
        expires_at,
      };
    }

    const pdf = await assetReportsService.generatePdf(
      userId,
      reportType as "ASSET_SUMMARY_REPORT",
      filters,
    );

    if (body.format === "excel") {
      const { id, expires_at } = putDownload(
        Buffer.from("Report export — use PDF for formatted output.\n", "utf8"),
        pdf.filename.replace(/\.pdf$/i, ".csv"),
        "text/csv",
      );
      const apiVersion = process.env.API_VERSION || "1";
      return {
        download_url: `/api/v${apiVersion}/enterprise/clients/${clientId}/assets/downloads/${id}`,
        filename: pdf.filename.replace(/\.pdf$/i, ".csv"),
        expires_at,
      };
    }

    const { id, expires_at } = putDownload(
      pdf.buffer,
      pdf.filename,
      "application/pdf",
    );
    const apiVersion = process.env.API_VERSION || "1";
    return {
      download_url: `/api/v${apiVersion}/enterprise/clients/${clientId}/assets/downloads/${id}`,
      filename: pdf.filename,
      expires_at,
    };
  },
};
