import { prisma } from "../../../config/database";
import {
  ACTOR_TYPES,
  AUDIT_CATEGORIES,
  AUDIT_EVENT_TYPES,
  PIPELINE_STAGES,
  RECORD_TYPES,
} from "../constants";
import { featuresAuditTrailService } from "./auditTrailService";

async function clientDisplayName(clientUserId: string): Promise<string> {
  const [user, business, company] = await Promise.all([
    prisma.user.findUnique({
      where: { id: clientUserId },
      select: {
        firstName: true,
        lastName: true,
        organizationName: true,
        email: true,
      },
    }),
    prisma.business.findFirst({
      where: { userId: clientUserId },
      select: { name: true },
    }),
    prisma.company.findFirst({
      where: { linkedUserId: clientUserId },
      select: { name: true },
    }),
  ]);
  return (
    company?.name ||
    business?.name ||
    user?.organizationName ||
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
    user?.email ||
    "Client"
  );
}

async function actorName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, organizationName: true, email: true },
  });
  return (
    user?.organizationName ||
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
    user?.email ||
    "mobile_user"
  );
}

/** Best-effort sync activity when mobile creates records. Never throws. */
export async function onMobileRecordsCreated(input: {
  clientUserId: string;
  module: "Sales" | "Expenses";
  recordCount: number;
  description?: string;
}): Promise<void> {
  try {
    if (input.recordCount < 1) return;
    await prisma.enterpriseSyncState.upsert({
      where: { clientUserId: input.clientUserId },
      create: {
        clientUserId: input.clientUserId,
        lastSyncAt: new Date(),
        syncStatus: "active",
      },
      update: { lastSyncAt: new Date(), syncStatus: "active" },
    });
    await prisma.enterpriseSyncActivity.create({
      data: {
        clientUserId: input.clientUserId,
        module: input.module,
        description:
          input.description ??
          `${input.recordCount} ${input.module.toLowerCase()} record${input.recordCount === 1 ? "" : "s"} received`,
        recordCount: input.recordCount,
        hasConflict: false,
        badge: `${input.recordCount} record${input.recordCount === 1 ? "" : "s"}`,
      },
    });
  } catch {
    /* keep mobile write path intact */
  }
}

/**
 * When a reviewed+ mobile record's classification changes, open an unresolved conflict.
 * Never throws.
 */
export async function onMobileClassificationEdit(input: {
  clientUserId: string;
  module: "Sales" | "Expenses";
  recordType: string;
  recordId: string;
  fieldLabel: string;
  previousValue: string;
  nextValue: string;
}): Promise<void> {
  try {
    if (
      !input.previousValue.trim() ||
      input.previousValue.trim() === input.nextValue.trim()
    ) {
      return;
    }

    const stage = await prisma.enterprisePipelineStage.findUnique({
      where: {
        recordType_recordId: {
          recordType: input.recordType,
          recordId: input.recordId,
        },
      },
    });
    const advanced =
      stage &&
      stage.pipelineStage !== PIPELINE_STAGES.IMPORTED;

    // Conflicts matter once enterprise has engaged the record, or always when
    // classification actually changed after sync activity exists.
    if (!advanced && !stage) {
      const hasActivity = await prisma.enterpriseSyncActivity.count({
        where: { clientUserId: input.clientUserId },
      });
      if (!hasActivity) return;
    }

    await prisma.enterpriseSyncConflict.create({
      data: {
        clientUserId: input.clientUserId,
        module: input.module,
        recordId: `${input.recordType}-${input.recordId}`,
        description: `Mobile edit created a ${input.fieldLabel} classification conflict`,
        mobileValue: input.nextValue,
        enterpriseValue: input.previousValue,
        status: "unresolved",
      },
    });

    await prisma.enterpriseSyncActivity.create({
      data: {
        clientUserId: input.clientUserId,
        module: input.module,
        description: `Classification conflict on ${input.fieldLabel}`,
        recordCount: 1,
        hasConflict: true,
        badge: "Action required",
      },
    });
  } catch {
    /* keep mobile write path intact */
  }
}

/** Audit deleted/reset events from undo or hard delete. Never throws. */
export async function onMobileRecordRemoved(input: {
  clientUserId: string;
  actorUserId: string;
  txId: string;
  amount: number;
  category: typeof AUDIT_CATEGORIES.INCOME | typeof AUDIT_CATEGORIES.EXPENSE;
  transactionDate: Date;
  reason?: string | null;
  /** void → deleted; reverse → reset */
  removalKind: "deleted" | "reset";
}): Promise<void> {
  try {
    const [clientName, actor] = await Promise.all([
      clientDisplayName(input.clientUserId),
      actorName(input.actorUserId),
    ]);
    await featuresAuditTrailService.recordEvent({
      txId: input.txId,
      clientUserId: input.clientUserId,
      clientName,
      amount: Math.abs(input.amount),
      actor,
      actorType: ACTOR_TYPES.MOBILE_USER,
      type:
        input.removalKind === "reset"
          ? AUDIT_EVENT_TYPES.RESET
          : AUDIT_EVENT_TYPES.DELETED,
      reason: input.reason ?? undefined,
      category: input.category,
      transactionDate: input.transactionDate,
    });
  } catch {
    /* keep undo/delete path intact */
  }
}

export { RECORD_TYPES, AUDIT_CATEGORIES };
