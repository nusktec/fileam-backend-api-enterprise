import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import {
  ASSET_EVENT_STATUS,
  ASSET_STATUS,
  TRANSFER_STATUSES,
  isAssetOnBooks,
} from "../../constants/assets";
import { LEDGER_REFERENCE_TYPES } from "../../constants/ledger";
import { RECEIVABLE_TYPES } from "../../constants/receivables";
import {
  RECORD_UNDO_ACTION,
  RECORD_UNDO_STATUS,
  USER_ADDED_RECORD_STATUS,
  type AssetDisposalUndoReason,
  type AssetSaleUndoReason,
  type AssetTransferUndoReason,
  type AssetUndoReason,
  undoStatusFromAction,
} from "../../constants/recordUndo";
import {
  assertNotAlreadyUndone,
  findPrimaryReversingEntry,
  recordHasLedgerImpact,
  resolveUndoAction,
} from "../../services/recordUndoService";
import {
  reverseAllLedgersForReferenceOnUndo,
  reverseAssetDisposalLedgerOnUndo,
  reverseAssetPurchaseLedgerOnUndo,
  reverseAssetSaleLedgerOnUndo,
} from "../../services/ledgerSyncService";
import { HttpReplyError } from "../../utils/httpReplyError";
import { assetsService } from "./assetsService";

function assertAssetCanUndo(status: string): void {
  assertNotAlreadyUndone(status, "asset");
  if (status === ASSET_STATUS.SOLD) {
    throw new HttpReplyError(
      409,
      "This asset cannot be undone because it has already been sold. Undo the sale first.",
    );
  }
  if (status === ASSET_STATUS.DISPOSED) {
    throw new HttpReplyError(
      409,
      "This asset cannot be undone because it has already been disposed. Undo the disposal first.",
    );
  }
}

async function resolveAssetUndoAction(
  userId: string,
  assetId: string,
): Promise<typeof RECORD_UNDO_ACTION.VOID | typeof RECORD_UNDO_ACTION.REVERSE> {
  const hasLedger = await recordHasLedgerImpact(userId, assetId);
  const action = resolveUndoAction(hasLedger);
  if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
    throw new HttpReplyError(
      409,
      "This asset cannot be voided because it has accounting impact",
    );
  }
  return action;
}

async function restoreAssetLocationAfterTransferUndo(
  tx: Prisma.TransactionClient,
  userId: string,
  assetId: string,
  transfer: { id: string; fromLocation: string; status: string },
): Promise<void> {
  if (transfer.status !== TRANSFER_STATUSES[1]) return;
  const latest = await tx.assetTransfer.findFirst({
    where: {
      userId,
      assetId,
      status: TRANSFER_STATUSES[1],
      id: { not: transfer.id },
    },
    orderBy: { transferDate: "desc" },
  });
  if (latest && latest.status === TRANSFER_STATUSES[1]) return;
  await tx.asset.update({
    where: { id: assetId },
    data: { assetLocation: transfer.fromLocation },
  });
}

export const assetUndoService = {
  async getAssetUndoCheck(userId: string, assetId: string) {
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, userId },
    });
    if (!asset) return null;
    assertAssetCanUndo(asset.status);
    const action = await resolveAssetUndoAction(userId, asset.id);
    return { action };
  },

  async undoAsset(userId: string, assetId: string, reason: AssetUndoReason) {
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, userId },
    });
    if (!asset) return null;

    assertAssetCanUndo(asset.status);
    const action = await resolveAssetUndoAction(userId, asset.id);
    const undoStatus = undoStatusFromAction(action);
    const undoAt = new Date();

    await prisma.$transaction(async (tx) => {
      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;

      if (action === RECORD_UNDO_ACTION.REVERSE) {
        await reverseAssetPurchaseLedgerOnUndo(
          userId,
          asset.id,
          asset.purchaseDate,
          tx,
        );
        const entry = await findPrimaryReversingEntry(
          userId,
          LEDGER_REFERENCE_TYPES.ASSET_PURCHASE,
          asset.id,
          tx,
        );
        reversingEntryId = entry?.id ?? null;
        reversingEntryDate = entry?.transactionDate ?? undoAt;
      }

      await tx.asset.update({
        where: { id: assetId },
        data: {
          status: undoStatus,
          undoAt,
          undoReason: reason,
          reversingEntryId,
          reversingEntryDate,
        },
      });
    });

    const data = await assetsService.getById(userId, assetId);
    return { action, status: undoStatus, data };
  },

  async getSaleUndoCheck(userId: string, saleId: string) {
    const sale = await prisma.assetSale.findFirst({
      where: { id: saleId, userId },
    });
    if (!sale) return null;
    assertNotAlreadyUndone(sale.status, "asset sale");
    return { action: RECORD_UNDO_ACTION.REVERSE };
  },

  async undoSale(
    userId: string,
    saleId: string,
    reason: AssetSaleUndoReason | string,
    opts?: { skipLinkedReceivable?: boolean },
  ) {
    const sale = await prisma.assetSale.findFirst({
      where: { id: saleId, userId },
      include: { asset: true },
    });
    if (!sale) return null;

    assertNotAlreadyUndone(sale.status, "asset sale");
    const undoAt = new Date();

    await prisma.$transaction(async (tx) => {
      await reverseAssetSaleLedgerOnUndo(userId, sale.id, sale.saleDate, tx);
      const entry = await findPrimaryReversingEntry(
        userId,
        LEDGER_REFERENCE_TYPES.ASSET_SALE,
        sale.id,
        tx,
      );
      await tx.assetSale.update({
        where: { id: saleId },
        data: {
          status: ASSET_EVENT_STATUS.REVERSED,
          undoAt,
          undoReason: reason,
          reversingEntryId: entry?.id ?? null,
          reversingEntryDate: entry?.transactionDate ?? undoAt,
        },
      });
      if (isAssetOnBooks(sale.asset.status) || sale.asset.status === ASSET_STATUS.SOLD) {
        await tx.asset.update({
          where: { id: sale.assetId },
          data: { status: ASSET_STATUS.ACTIVE },
        });
      }
    });

    if (!opts?.skipLinkedReceivable) {
      const linked = await prisma.receivable.findFirst({
        where: {
          userId,
          assetId: sale.assetId,
          type: RECEIVABLE_TYPES.FIXED_ASSET_SALE_ON_CREDIT,
          recordStatus: USER_ADDED_RECORD_STATUS.LIVE,
        },
        orderBy: { createdAt: "desc" },
      });
      if (linked) {
        const { receivableUndoService } = await import("./receivableUndoService");
        await receivableUndoService.undo(userId, linked.id, reason, {
          skipLinkedSale: true,
        });
      }
    }

    const data = await assetsService.getSaleById(userId, saleId);
    return {
      action: RECORD_UNDO_ACTION.REVERSE,
      status: RECORD_UNDO_STATUS.REVERSED,
      data,
    };
  },

  async getDisposalUndoCheck(userId: string, disposalId: string) {
    const disposal = await prisma.assetDisposal.findFirst({
      where: { id: disposalId, userId },
    });
    if (!disposal) return null;
    assertNotAlreadyUndone(disposal.status, "asset disposal");
    return { action: RECORD_UNDO_ACTION.REVERSE };
  },

  async undoDisposal(
    userId: string,
    disposalId: string,
    reason: AssetDisposalUndoReason,
  ) {
    const disposal = await prisma.assetDisposal.findFirst({
      where: { id: disposalId, userId },
      include: { asset: true },
    });
    if (!disposal) return null;

    assertNotAlreadyUndone(disposal.status, "asset disposal");
    const undoAt = new Date();

    await prisma.$transaction(async (tx) => {
      await reverseAssetDisposalLedgerOnUndo(
        userId,
        disposal.id,
        disposal.disposalDate,
        tx,
      );
      const entry = await findPrimaryReversingEntry(
        userId,
        LEDGER_REFERENCE_TYPES.ASSET_DISPOSAL,
        disposal.id,
        tx,
      );
      await tx.assetDisposal.update({
        where: { id: disposalId },
        data: {
          status: ASSET_EVENT_STATUS.REVERSED,
          undoAt,
          undoReason: reason,
          reversingEntryId: entry?.id ?? null,
          reversingEntryDate: entry?.transactionDate ?? undoAt,
        },
      });
      if (
        disposal.asset.status === ASSET_STATUS.DISPOSED ||
        isAssetOnBooks(disposal.asset.status)
      ) {
        await tx.asset.update({
          where: { id: disposal.assetId },
          data: { status: ASSET_STATUS.ACTIVE },
        });
      }
    });

    const data = await assetsService.getDisposalById(userId, disposalId);
    return {
      action: RECORD_UNDO_ACTION.REVERSE,
      status: RECORD_UNDO_STATUS.REVERSED,
      data,
    };
  },

  async getTransferUndoCheck(userId: string, transferId: string) {
    const transfer = await prisma.assetTransfer.findFirst({
      where: { id: transferId, userId },
    });
    if (!transfer) return null;

    if (transfer.status === TRANSFER_STATUSES[2]) {
      throw new HttpReplyError(
        409,
        "This transfer cannot be undone because it is already cancelled.",
      );
    }
    assertNotAlreadyUndone(transfer.status, "asset transfer");

    const hasLedger = await recordHasLedgerImpact(userId, transfer.id);
    const action = resolveUndoAction(hasLedger);
    if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
      throw new HttpReplyError(
        409,
        "This transfer cannot be voided because it has accounting impact",
      );
    }
    return { action };
  },

  async undoTransfer(
    userId: string,
    transferId: string,
    reason: AssetTransferUndoReason,
  ) {
    const transfer = await prisma.assetTransfer.findFirst({
      where: { id: transferId, userId },
    });
    if (!transfer) return null;

    if (transfer.status === TRANSFER_STATUSES[2]) {
      throw new HttpReplyError(
        409,
        "This transfer cannot be undone because it is already cancelled.",
      );
    }
    assertNotAlreadyUndone(transfer.status, "asset transfer");

    const hasLedger = await recordHasLedgerImpact(userId, transfer.id);
    const action = resolveUndoAction(hasLedger);
    if (action === RECORD_UNDO_ACTION.VOID && hasLedger) {
      throw new HttpReplyError(
        409,
        "This transfer cannot be voided because it has accounting impact",
      );
    }

    const undoStatus = undoStatusFromAction(action);
    const undoAt = new Date();

    await prisma.$transaction(async (tx) => {
      let reversingEntryId: string | null = null;
      let reversingEntryDate: Date | null = null;

      if (action === RECORD_UNDO_ACTION.REVERSE) {
        await reverseAllLedgersForReferenceOnUndo(
          userId,
          transfer.id,
          `Undo asset transfer ${transfer.id}`,
          transfer.transferDate,
          tx,
        );
        const originals = await tx.ledgerTransaction.findMany({
          where: {
            userId,
            referenceId: transfer.id,
            status: "REVERSED",
          },
          select: { id: true },
        });
        const entry = originals.length
          ? await tx.ledgerTransaction.findFirst({
              where: {
                userId,
                reversalOfId: { in: originals.map((o) => o.id) },
                status: "POSTED",
              },
              orderBy: { createdAt: "asc" },
            })
          : null;
        reversingEntryId = entry?.id ?? null;
        reversingEntryDate = entry?.transactionDate ?? undoAt;
      }

      await tx.assetTransfer.update({
        where: { id: transferId },
        data: {
          status: undoStatus,
          undoAt,
          undoReason: reason,
          reversingEntryId,
          reversingEntryDate,
        },
      });

      await restoreAssetLocationAfterTransferUndo(
        tx,
        userId,
        transfer.assetId,
        transfer,
      );
    });

    const data = await assetsService.getTransferById(userId, transferId);
    return { action, status: undoStatus, data };
  },
};
