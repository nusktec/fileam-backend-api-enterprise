import { prisma } from "../config/database";

export async function nextDisplayCode(
  counterId: string,
  prefix: string,
  pad = 3,
): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { id: counterId },
    create: { id: counterId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${prefix}-${String(counter.lastNumber).padStart(pad, "0")}`;
}
