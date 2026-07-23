import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import type { AssetHistoryActionType } from "../../constants/assets";

type Tx = Prisma.TransactionClient;

function dateOnly(d: Date = new Date()): Date {
  return new Date(
    `${d.toISOString().slice(0, 10)}T12:00:00.000Z`,
  );
}

export async function appendAssetHistory(
  client: typeof prisma | Tx,
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
