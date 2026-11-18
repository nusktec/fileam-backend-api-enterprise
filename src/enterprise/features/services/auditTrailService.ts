import { prisma } from "../../../config/database";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { HttpStatusCode } from "../../../interfaces/system";
import {
  ACTOR_TYPES,
  AUDIT_CATEGORIES,
  AUDIT_EVENT_TYPES,
  HIGH_RISK_AMOUNT,
} from "../constants";
import { decimalToNumber, formatYmd, parsePositiveInt } from "../utils";
import { canAccessClient } from "../../services/enterpriseManagedEntitiesService";

function isHighRisk(input: {
  amount: number;
  category: string;
  type: string;
  priorCount: number;
}): boolean {
  if (input.amount > HIGH_RISK_AMOUNT) return true;
  if (
    input.category === AUDIT_CATEGORIES.INCOME &&
    input.type === AUDIT_EVENT_TYPES.DELETED
  ) {
    return true;
  }
  if (input.priorCount >= 1) return true;
  return false;
}

export const featuresAuditTrailService = {
  async list(
    consultantUserId: string,
    opts: {
      clientId?: string;
      type?: string;
      highRisk?: boolean;
      page?: unknown;
      limit?: unknown;
      search?: string;
      module?: string;
      actor?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const page = parsePositiveInt(opts.page, 1);
    const limit = parsePositiveInt(opts.limit, 50);

    const clientFilter: string[] = [];
    if (opts.clientId) {
      const access = await canAccessClient(consultantUserId, opts.clientId);
      if (!access.allowed) {
        return {
          items: [],
          pagination: { total: 0, page, limit },
        };
      }
      clientFilter.push(opts.clientId);
    } else {
      const connections = await prisma.consultantConnection.findMany({
        where: { consultantUserId, status: "active" },
        select: { userId: true },
      });
      clientFilter.push(...connections.map((c) => c.userId));
    }

    const where: {
      clientUserId: { in: string[] };
      type?: string;
      highRisk?: boolean;
      actor?: { contains: string; mode: "insensitive" };
      createdAt?: { gte?: Date; lte?: Date };
      OR?: Array<Record<string, unknown>>;
    } = {
      clientUserId: { in: clientFilter.length ? clientFilter : ["__none__"] },
    };
    if (opts.type === AUDIT_EVENT_TYPES.DELETED || opts.type === AUDIT_EVENT_TYPES.RESET) {
      where.type = opts.type;
    }
    if (opts.highRisk === true) where.highRisk = true;
    if (opts.module && opts.module !== "transactions") {
      return { items: [], pagination: { total: 0, page, limit } };
    }
    if (opts.actor?.trim()) {
      where.actor = { contains: opts.actor.trim(), mode: "insensitive" };
    }
    if (opts.dateFrom || opts.dateTo) {
      where.createdAt = {
        ...(opts.dateFrom ? { gte: new Date(opts.dateFrom) } : {}),
        ...(opts.dateTo ? { lte: new Date(opts.dateTo) } : {}),
      };
    }
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { txId: { contains: q, mode: "insensitive" } },
        { clientName: { contains: q, mode: "insensitive" } },
        { actor: { contains: q, mode: "insensitive" } },
        { reason: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.enterpriseAuditTrailEvent.count({ where }),
      prisma.enterpriseAuditTrailEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        txId: r.txId,
        clientId: r.clientUserId,
        clientName: r.clientName,
        amount: decimalToNumber(r.amount),
        actor: r.actor,
        actorType: r.actorType,
        createdAt: r.createdAt.toISOString(),
        type: r.type,
        highRisk: r.highRisk,
        reason: r.reason,
        category: r.category,
        module: "transactions",
        transactionDate: formatYmd(r.transactionDate),
        reviewed: r.reviewed,
        reviewedBy: r.reviewedBy,
        reviewNote: r.reviewNote,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        flagged: r.flagged,
      })),
      pagination: { total, page, limit },
    };
  },

  async review(
    consultantUserId: string,
    eventId: string,
    note: string,
    reviewerName: string,
  ) {
    const event = await prisma.enterpriseAuditTrailEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new HttpReplyError(HttpStatusCode.NOT_FOUND, "Audit item not found");
    }
    const access = await canAccessClient(consultantUserId, event.clientUserId);
    if (!access.allowed) {
      throw new HttpReplyError(HttpStatusCode.NOT_FOUND, "Audit item not found");
    }

    const updated = await prisma.enterpriseAuditTrailEvent.update({
      where: { id: eventId },
      data: {
        reviewed: true,
        reviewedBy: reviewerName,
        reviewNote: note,
        reviewedAt: new Date(),
      },
    });

    return {
      id: updated.id,
      reviewed: true,
      reviewedBy: updated.reviewedBy,
      reviewNote: updated.reviewNote,
      reviewedAt: updated.reviewedAt!.toISOString(),
    };
  },

  async flag(consultantUserId: string, eventId: string, _note: string) {
    const event = await prisma.enterpriseAuditTrailEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new HttpReplyError(HttpStatusCode.NOT_FOUND, "Audit item not found");
    }
    const access = await canAccessClient(consultantUserId, event.clientUserId);
    if (!access.allowed) {
      throw new HttpReplyError(HttpStatusCode.NOT_FOUND, "Audit item not found");
    }

    const flaggedAt = new Date();
    const updated = await prisma.enterpriseAuditTrailEvent.update({
      where: { id: eventId },
      data: { flagged: true, flaggedAt },
    });

    return {
      id: updated.id,
      flagged: true,
      flaggedAt: flaggedAt.toISOString(),
    };
  },

  /** Helper for other services to record deleted/reset events with high-risk rules. */
  async recordEvent(input: {
    txId: string;
    clientUserId: string;
    clientName: string;
    amount: number;
    actor: string;
    actorType: typeof ACTOR_TYPES.MOBILE_USER | typeof ACTOR_TYPES.CONSULTANT;
    type: typeof AUDIT_EVENT_TYPES.DELETED | typeof AUDIT_EVENT_TYPES.RESET;
    reason?: string;
    category: typeof AUDIT_CATEGORIES.INCOME | typeof AUDIT_CATEGORIES.EXPENSE;
    transactionDate: Date;
  }) {
    const priorCount = await prisma.enterpriseAuditTrailEvent.count({
      where: {
        txId: input.txId,
        clientUserId: input.clientUserId,
        type: { in: [AUDIT_EVENT_TYPES.DELETED, AUDIT_EVENT_TYPES.RESET] },
      },
    });
    const highRisk = isHighRisk({
      amount: input.amount,
      category: input.category,
      type: input.type,
      priorCount,
    });

    return prisma.enterpriseAuditTrailEvent.create({
      data: {
        txId: input.txId,
        clientUserId: input.clientUserId,
        clientName: input.clientName,
        amount: input.amount,
        actor: input.actor,
        actorType: input.actorType,
        type: input.type,
        highRisk,
        reason: input.reason,
        category: input.category,
        transactionDate: input.transactionDate,
      },
    });
  },
};
