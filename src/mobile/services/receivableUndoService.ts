import { prisma } from "../../config/database";
import { ASSET_STATUS } from "../../constants/assets";
import { LEDGER_REFERENCE_TYPES } from "../../constants/ledger";
import {
  isUndoneStatus,
  mapUndoPayload,
  RECORD_UNDO_ACTION,
  RECORD_UNDO_STATUS,
  USER_ADDED_RECORD_STATUS,
  type AssetReceivableUndoReason,
  undoStatusFromAction,
} from "../../constants/recordUndo";
import { RECEIVABLE_TYPES } from "../../constants/receivables";
import {
  assertNotAlreadyUndone,
  findPrimaryReversingEntry,
  recordHasLedgerImpact,
  resolveUndoAction,
} from "../../services/recordUndoService";
import { reverseReceivableLedgerOnUndo } from "../../services/ledgerSyncService";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { assetUndoService } from "./assetUndoService";

function d(v: { toNumber?: () => number } | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

function formatYmd(date: Date | null | undefined): string | null {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mapCurrentAssetReceivableItem(row: {
  id: string;
  receivableCode: string;
  type: string;
  status: string;
  recordStatus: string;
  partyName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  grossAmount: { toNumber?: () => number } | number;
  amountReceived: { toNumber?: () => number } | number;
  outstandingAmount: { toNumber?: () => number } | number;
  dueDate: Date | null;
  undoAt?: Date | null;
  undoReason?: string | null;
  reversingEntryId?: string | null;
  reversingEntryDate?: Date | null;
}) {
  const undone = isUndoneStatus(row.recordStatus);
  const item: Record<string, unknown> = {
    id: row.id,
    receivableCode: row.receivableCode,
    type: row.type,
    amount: normalizeMoneyAmount(d(row.grossAmount)),
    amountReceived: normalizeMoneyAmount(d(row.amountReceived)),
    outstandingAmount: normalizeMoneyAmount(d(row.outstandingAmount)),
    dueDate: formatYmd(row.dueDate),
    status: undone ? row.recordStatus : row.status,
    source: "user" as const,
    undo: mapUndoPayload(row),
  };
  if (row.partyName) item.partyName = row.partyName;
  if (row.supplierId) item.supplierId = row.supplierId;
  if (row.supplierName) item.supplierName = row.supplierName;
  return item;
}

async function findReceivable(userId: string, id: string) {
  return prisma.receivable.findFirst({
    where: { userId, OR: [{ id }, { receivableCode: id }] },
  });
}

async function resolveUndoOrThrow(userId: string, referenceId: string) {
  const hasLedger = await recordHasLedgerImpact(userId, referenceId);
  const action = resolveUndoAction(hasLedger);
  if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
    throw new HttpReplyError(
      409,
      "This receivable cannot be voided because it has accounting impact",
    );
  }
  return action;
}

export const receivableUndoService = {
  async getUndoCheck(userId: string, id: string) {
    const row = await findReceivable(userId, id);
    if (!row) return null;
    assertNotAlreadyUndone(row.recordStatus, "receivable");
    const action = await resolveUndoOrThrow(userId, row.id);
    return { action };
  },

  async undo(
    userId: string,
    id: string,
    reason: AssetReceivableUndoReason | string,
    opts?: { skipLinkedSale?: boolean },
  ) {
    const row = await findReceivable(userId, id);
    if (!row) return null;
    assertNotAlreadyUndone(row.recordStatus, "receivable");
    const action = await resolveUndoOrThrow(userId, row.id);
    const undoStatus = undoStatusFromAction(action);
    const undoAt = new Date();

    await prisma.$transaction(async (tx) => {
      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;
      if (action === RECORD_UNDO_ACTION.REVERSE) {
        await reverseReceivableLedgerOnUndo(userId, row.id, undoAt, tx);
        const entry = await findPrimaryReversingEntry(
          userId,
          LEDGER_REFERENCE_TYPES.RECEIVABLE,
          row.id,
          tx,
        );
        reversingEntryId = entry?.id ?? null;
        reversingEntryDate = entry?.transactionDate ?? undoAt;
      }
      await tx.receivable.update({
        where: { id: row.id },
        data: {
          recordStatus: undoStatus,
          undoAt,
          undoReason: reason,
          reversingEntryId,
          reversingEntryDate,
        },
      });
    });

    if (
      !opts?.skipLinkedSale &&
      row.type === RECEIVABLE_TYPES.FIXED_ASSET_SALE_ON_CREDIT &&
      row.assetId
    ) {
      const sale = await prisma.assetSale.findFirst({
        where: {
          userId,
          assetId: row.assetId,
          status: { not: RECORD_UNDO_STATUS.REVERSED },
        },
        orderBy: { createdAt: "desc" },
      });
      if (sale) {
        await assetUndoService.undoSale(userId, sale.id, reason, {
          skipLinkedReceivable: true,
        });
      } else {
        const asset = await prisma.asset.findFirst({
          where: { id: row.assetId, userId },
        });
        if (asset?.status === ASSET_STATUS.SOLD) {
          await prisma.asset.update({
            where: { id: asset.id },
            data: { status: ASSET_STATUS.ACTIVE },
          });
        }
      }
    }

    const data = await findReceivable(userId, row.id);
    return {
      action,
      status: undoStatus,
      data: data ? mapCurrentAssetReceivableItem(data) : null,
    };
  },
};

export function isLiveReceivable(recordStatus: string | null | undefined) {
  return (
    !isUndoneStatus(recordStatus) &&
    (recordStatus ?? USER_ADDED_RECORD_STATUS.LIVE) ===
      USER_ADDED_RECORD_STATUS.LIVE
  );
}
