import { prisma } from "../../config/database";
import { ASSET_STATUS } from "../../constants/assets";
import { LEDGER_REFERENCE_TYPES } from "../../constants/ledger";
import {
  isUndoneStatus,
  mapUndoPayload,
  RECORD_UNDO_ACTION,
  RECORD_UNDO_STATUS,
  type UnitAttributionRecordUndoReason,
  type UnitAttributionUndoReason,
} from "../../constants/recordUndo";
import { PRODUCTION_RECORD_STATUS } from "../../constants/unitAttribution";
import {
  assertNotAlreadyUndone,
  findPrimaryReversingEntry,
} from "../../services/recordUndoService";
import { reverseDepreciationLedgerOnUndo } from "../../services/ledgerSyncService";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { unitAttributionService } from "./unitAttributionService";

const LINK_HAS_RECORDS =
  "This unit attribution cannot be undone because production units have already been recorded. Undo those records first.";

export const unitAttributionUndoService = {
  async getLinkUndoCheck(userId: string, id: string) {
    const row = await prisma.unitAttribution.findFirst({
      where: { id, userId },
      include: { records: { select: { id: true } } },
    });
    if (!row) return null;
    assertNotAlreadyUndone(row.status, "unit attribution");
    if (row.records.length > 0) {
      throw new HttpReplyError(409, LINK_HAS_RECORDS);
    }
    return { action: RECORD_UNDO_ACTION.VOID };
  },

  async undoLink(userId: string, id: string, reason: UnitAttributionUndoReason) {
    const row = await prisma.unitAttribution.findFirst({
      where: { id, userId },
      include: { records: { select: { id: true } } },
    });
    if (!row) return null;
    assertNotAlreadyUndone(row.status, "unit attribution");
    if (row.records.length > 0) {
      throw new HttpReplyError(409, LINK_HAS_RECORDS);
    }

    const undoAt = new Date();
    await prisma.unitAttribution.update({
      where: { id: row.id },
      data: {
        status: RECORD_UNDO_STATUS.VOIDED,
        undoAt,
        undoReason: reason,
        reversingEntryId: null,
        reversingEntryDate: null,
      },
    });

    const data = await unitAttributionService.getById(userId, row.id);
    return {
      action: RECORD_UNDO_ACTION.VOID,
      status: RECORD_UNDO_STATUS.VOIDED,
      data,
    };
  },

  async getRecordUndoCheck(userId: string, id: string, recordId: string) {
    const parent = await prisma.unitAttribution.findFirst({
      where: { id, userId },
    });
    if (!parent) return null;
    if (isUndoneStatus(parent.status)) {
      throw new HttpReplyError(
        409,
        "This unit attribution has already been voided or reversed",
      );
    }
    const record = await prisma.unitAttributionProductionRecord.findFirst({
      where: { id: recordId, unitAttributionId: id },
    });
    if (!record) return null;
    if (record.status === PRODUCTION_RECORD_STATUS.OPEN) {
      throw new HttpReplyError(409, "This period has not been recorded");
    }
    assertNotAlreadyUndone(record.status, "production record");
    return { action: RECORD_UNDO_ACTION.REVERSE };
  },

  async undoRecord(
    userId: string,
    id: string,
    recordId: string,
    reason: UnitAttributionRecordUndoReason,
  ) {
    const parent = await prisma.unitAttribution.findFirst({
      where: { id, userId },
      include: { asset: true },
    });
    if (!parent) return null;
    if (isUndoneStatus(parent.status)) {
      throw new HttpReplyError(
        409,
        "This unit attribution has already been voided or reversed",
      );
    }

    const record = await prisma.unitAttributionProductionRecord.findFirst({
      where: { id: recordId, unitAttributionId: id },
    });
    if (!record) return null;
    if (record.status === PRODUCTION_RECORD_STATUS.OPEN) {
      throw new HttpReplyError(409, "This period has not been recorded");
    }
    assertNotAlreadyUndone(record.status, "production record");

    const undoAt = new Date();
    await prisma.$transaction(async (tx) => {
      await reverseDepreciationLedgerOnUndo(
        userId,
        record.id,
        record.periodEnd,
        tx,
      );
      const entry = await findPrimaryReversingEntry(
        userId,
        LEDGER_REFERENCE_TYPES.DEPRECIATION,
        record.id,
        tx,
      );

      await tx.unitAttributionProductionRecord.update({
        where: { id: record.id },
        data: {
          status: RECORD_UNDO_STATUS.REVERSED,
          undoAt,
          undoReason: reason,
          reversingEntryId: entry?.id ?? null,
          reversingEntryDate: entry?.transactionDate ?? undoAt,
        },
      });

      const currentUnits = Number(parent.asset.unitProduced ?? 0);
      const nextUnits = Math.max(0, currentUnits - record.unitsAttributed);
      if (
        parent.asset.status === ASSET_STATUS.ACTIVE ||
        parent.asset.status === ASSET_STATUS.AWAITING
      ) {
        await tx.asset.update({
          where: { id: parent.assetId },
          data: { unitProduced: nextUnits },
        });
      }
    });

    const detail = await unitAttributionService.getById(userId, parent.id);
    const period = detail.schedule.find((p) => p.id === record.id);
    return {
      action: RECORD_UNDO_ACTION.REVERSE,
      status: RECORD_UNDO_STATUS.REVERSED,
      data: period ?? {
        id: record.id,
        periodLabel: record.periodLabel,
        status: RECORD_UNDO_STATUS.REVERSED,
        undo: mapUndoPayload({
          undoAt,
          undoReason: reason,
          reversingEntryId: null,
          reversingEntryDate: undoAt,
        }),
      },
    };
  },
};

export function productionDepreciationAmount(
  units: number,
  depreciationPerUnit: number,
) {
  return normalizeMoneyAmount(units * depreciationPerUnit);
}
