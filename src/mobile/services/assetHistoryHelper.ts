import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import type { AssetHistoryActionType } from "../../constants/assets";
import { TRANSFER_STATUSES } from "../../constants/assets";

type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

function dateOnly(d: Date = new Date()): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T12:00:00.000Z`);
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function appendAssetHistory(
  client: Db,
  input: {
    userId: string;
    assetId: string;
    type: AssetHistoryActionType;
    eventDate?: Date;
    details?: Record<string, unknown>;
  },
) {
  return client.assetHistory.create({
    data: {
      userId: input.userId,
      assetId: input.assetId,
      type: input.type,
      eventDate: input.eventDate ?? dateOnly(),
      details: (input.details ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Backfill history rows from existing transfers / disposals / assets so
 * timelines stay complete even when events were recorded before history logging
 * or when a write path missed logging.
 */
export async function syncAssetHistoryFromRecords(
  userId: string,
  assetId?: string,
): Promise<void> {
  const assetFilter = assetId ? { assetId } : {};

  const [assets, transfers, disposals, existing] = await Promise.all([
    prisma.asset.findMany({
      where: { userId, ...(assetId ? { id: assetId } : {}) },
      select: {
        id: true,
        assetName: true,
        vendor: true,
        purchaseCost: true,
        purchaseDate: true,
      },
    }),
    prisma.assetTransfer.findMany({
      where: {
        userId,
        ...assetFilter,
        status: { not: TRANSFER_STATUSES[2] }, // skip cancelled
      },
      select: {
        assetId: true,
        transferType: true,
        fromLocation: true,
        toLocation: true,
        transferDate: true,
        status: true,
      },
    }),
    prisma.assetDisposal.findMany({
      where: { userId, ...assetFilter },
      select: {
        assetId: true,
        disposalReason: true,
        note: true,
        disposalDate: true,
      },
    }),
    prisma.assetHistory.findMany({
      where: { userId, ...(assetId ? { assetId } : {}) },
      select: {
        assetId: true,
        type: true,
        eventDate: true,
        details: true,
      },
    }),
  ]);

  const hasAcquired = new Set(
    existing.filter((h) => h.type === "ASSET_ACQUIRED").map((h) => h.assetId),
  );

  const transferKeys = new Set(
    existing
      .filter((h) => h.type === "ASSET_TRANSFER")
      .map((h) => {
        const d =
          h.details && typeof h.details === "object" && !Array.isArray(h.details)
            ? (h.details as Record<string, unknown>)
            : {};
        return [
          h.assetId,
          dateKey(h.eventDate),
          String(d.fromLocation ?? ""),
          String(d.toLocation ?? ""),
          String(d.transferType ?? ""),
        ].join("|");
      }),
  );

  const disposalKeys = new Set(
    existing
      .filter((h) => h.type === "ASSET_DISPOSAL")
      .map((h) => {
        const d =
          h.details && typeof h.details === "object" && !Array.isArray(h.details)
            ? (h.details as Record<string, unknown>)
            : {};
        return [
          h.assetId,
          dateKey(h.eventDate),
          String(d.disposalReason ?? ""),
        ].join("|");
      }),
  );

  const toCreate: Prisma.AssetHistoryCreateManyInput[] = [];

  for (const a of assets) {
    if (hasAcquired.has(a.id)) continue;
    toCreate.push({
      userId,
      assetId: a.id,
      type: "ASSET_ACQUIRED",
      eventDate: a.purchaseDate,
      details: {
        assetName: a.assetName,
        vendor: a.vendor,
        purchaseCost: Number(a.purchaseCost),
        assignedEmployee: null,
      },
    });
  }

  for (const t of transfers) {
    const key = [
      t.assetId,
      dateKey(t.transferDate),
      t.fromLocation,
      t.toLocation,
      t.transferType,
    ].join("|");
    if (transferKeys.has(key)) continue;
    transferKeys.add(key);
    toCreate.push({
      userId,
      assetId: t.assetId,
      type: "ASSET_TRANSFER",
      eventDate: t.transferDate,
      details: {
        fromLocation: t.fromLocation,
        toLocation: t.toLocation,
        transferType: t.transferType,
        status: t.status,
      },
    });
  }

  for (const d of disposals) {
    const key = [d.assetId, dateKey(d.disposalDate), d.disposalReason].join(
      "|",
    );
    if (disposalKeys.has(key)) continue;
    disposalKeys.add(key);
    toCreate.push({
      userId,
      assetId: d.assetId,
      type: "ASSET_DISPOSAL",
      eventDate: d.disposalDate,
      details: {
        disposalReason: d.disposalReason,
        note: d.note,
      },
    });
  }

  if (toCreate.length === 0) return;
  await prisma.assetHistory.createMany({ data: toCreate });
}
