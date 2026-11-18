import { prisma } from "../../../config/database";
import { HttpReplyError } from "../../../utils/httpReplyError";
import { HttpStatusCode } from "../../../interfaces/system";
import { featuresTaxOptimizerService } from "./taxOptimizerService";

async function runJob(jobId: string, clientUserId: string, year: number) {
  try {
    await prisma.enterpriseTaxOptimizeJob.update({
      where: { id: jobId },
      data: { status: "running" },
    });

    const snapshot = await featuresTaxOptimizerService.getSnapshot(
      clientUserId,
      year,
    );

    const result = {
      ...snapshot,
      analysisComplete: true,
    };

    await prisma.enterpriseTaxOptimizeJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        result,
        completedAt: new Date(),
        error: null,
      },
    });
  } catch (error) {
    await prisma.enterpriseTaxOptimizeJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Tax optimize failed",
        completedAt: new Date(),
      },
    });
  }
}

export const featuresTaxOptimizeJobService = {
  async start(clientUserId: string, year?: number) {
    const y =
      year && Number.isFinite(year) ? Math.floor(year) : new Date().getUTCFullYear();

    const job = await prisma.enterpriseTaxOptimizeJob.create({
      data: {
        clientUserId,
        year: y,
        status: "pending",
      },
    });

    void runJob(job.id, clientUserId, y);

    return {
      jobId: job.id,
      status: "pending" as const,
      year: y,
      startedAt: job.createdAt.toISOString(),
    };
  },

  async poll(clientUserId: string, jobId: string) {
    const job = await prisma.enterpriseTaxOptimizeJob.findFirst({
      where: { id: jobId, clientUserId },
    });
    if (!job) {
      throw new HttpReplyError(HttpStatusCode.NOT_FOUND, "Job not found");
    }

    return {
      jobId: job.id,
      status: job.status,
      year: job.year,
      startedAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      error: job.error,
      result: job.result,
    };
  },
};
