import PDFDocument from "pdfkit";
import { generateTaxFilingPdf } from "../../services/template/pdfTemplates";
import type { WorkspaceTaxType } from "../../constants/filingWorkspace";
import { documentDefsForTaxType } from "../../constants/filingWorkspace";
import { uploadToS3 } from "../../services/mediaUploadService";
import { getPresignedUrl } from "../../config/s3";
import { MEDIA_CONFIG } from "../../config/s3";

const PRESIGNED_EXPIRY_SECONDS = 3600;

export type GeneratedFilingDoc = {
  id: string;
  title: string;
  subtitle?: string;
  status: "ready" | "unavailable";
  contentType: string;
  fileUrl: string | null;
  fileName: string;
  bytes: number;
  source: "generated" | "linked";
  fileKey?: string;
};

function buildWorkingPaperPdf(params: {
  title: string;
  subtitle?: string;
  taxType: string;
  periodLabel: string;
  dueDate: string;
  lines: Array<{ label: string; value: string }>;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).fillColor("#1a5276").text(params.title, { align: "left" });
    if (params.subtitle) {
      doc.fontSize(10).fillColor("#666").text(params.subtitle);
    }
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#333");
    doc.text(`${params.taxType} · ${params.periodLabel}`);
    doc.text(`Due: ${params.dueDate}`);
    doc.moveDown();
    doc.fontSize(8).fillColor("#999").text(
      "FileAm working paper — not filed with NRS/State IRS.",
    );
    doc.moveDown();

    for (const line of params.lines) {
      doc.fontSize(10).fillColor("#333").text(`${line.label}: ${line.value}`);
    }

    doc.end();
  });
}

function computationLines(
  taxType: WorkspaceTaxType,
  computation: Record<string, unknown> | null,
  amount: number,
): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [
    { label: "Amount due (NGN)", value: String(amount) },
  ];
  if (!computation) return lines;

  if (taxType === "VAT") {
    lines.push(
      { label: "Output VAT", value: String(computation.outputVat ?? 0) },
      { label: "Input VAT claimable", value: String(computation.inputVatClaimable ?? 0) },
      { label: "Net VAT payable", value: String(computation.netVatPayable ?? amount) },
    );
  } else if (taxType === "WHT") {
    lines.push({ label: "Total WHT", value: String(computation.totalWht ?? amount) });
  } else if (taxType === "PIT") {
    lines.push(
      { label: "Total income", value: String(computation.totalIncome ?? 0) },
      { label: "Chargeable income", value: String(computation.chargeableIncome ?? 0) },
      { label: "Remaining payable", value: String(computation.remainingPayable ?? amount) },
    );
  } else if (taxType === "CIT") {
    lines.push(
      { label: "Assessable profit", value: String(computation.assessableProfit ?? 0) },
      { label: "CIT amount", value: String(computation.citAmount ?? 0) },
      { label: "Development levy", value: String(computation.developmentLevy ?? 0) },
      { label: "CIT payable", value: String(computation.citPayable ?? amount) },
    );
  }
  return lines;
}

export async function generateFilingDocuments(params: {
  userId: string;
  taxType: WorkspaceTaxType;
  periodYear: number;
  periodMonth: number;
  periodLabel: string;
  dueDate: string;
  amount: number;
  computation: Record<string, unknown> | null;
  paymentReceiptUrl?: string | null;
}): Promise<{
  documents: GeneratedFilingDoc[];
  packageUrl: string | null;
  packageExpiresAt: Date;
}> {
  const defs = documentDefsForTaxType(params.taxType);
  const expiresAt = new Date(Date.now() + PRESIGNED_EXPIRY_SECONDS * 1000);
  const baseLines = computationLines(
    params.taxType,
    params.computation,
    params.amount,
  );
  const documents: GeneratedFilingDoc[] = [];

  for (const def of defs) {
    if (def.requiresPaymentProof && !params.paymentReceiptUrl) {
      documents.push({
        id: def.id,
        title: def.title,
        subtitle: def.subtitle,
        status: "unavailable",
        contentType: "application/pdf",
        fileUrl: null,
        fileName: `${def.id}.pdf`,
        bytes: 0,
        source: "generated",
      });
      continue;
    }

    let buffer: Buffer;
    if (def.id === "evidence-index") {
      const indexLines = defs.map((d) => ({
        label: d.title,
        value: d.id,
      }));
      buffer = await buildWorkingPaperPdf({
        title: "Filing Evidence Index",
        taxType: params.taxType,
        periodLabel: params.periodLabel,
        dueDate: params.dueDate,
        lines: indexLines,
      });
    } else if (def.id === "form-002" || def.id === "c08a" || def.id === "self-assessment") {
      buffer = await generateTaxFilingPdf({
        taxType: `${params.taxType} ${def.title}`,
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
        filingDueDate: new Date(params.dueDate),
        status: "Working paper",
        amountDue: params.amount,
        penalties: 0,
        totalPayable: params.amount,
        currency: "NGN",
        submittedAt: null,
      });
    } else {
      buffer = await buildWorkingPaperPdf({
        title: def.title,
        subtitle: def.subtitle,
        taxType: params.taxType,
        periodLabel: params.periodLabel,
        dueDate: params.dueDate,
        lines: baseLines,
      });
    }

    const fileName = `${params.taxType}-${params.periodYear}-${String(params.periodMonth).padStart(2, "0")}-${def.id}.pdf`;
    const uploaded = await uploadToS3({
      buffer,
      mimetype: "application/pdf",
      originalName: fileName,
      folder: MEDIA_CONFIG.UPLOAD_FOLDERS.DOCUMENTS,
    });

    let fileUrl = uploaded?.url ?? null;
    if (uploaded?.key) {
      fileUrl =
        (await getPresignedUrl(uploaded.key, PRESIGNED_EXPIRY_SECONDS)) ??
        fileUrl;
    }

    documents.push({
      id: def.id,
      title: def.title,
      subtitle: def.subtitle,
      status: fileUrl ? "ready" : "unavailable",
      contentType: "application/pdf",
      fileUrl,
      fileName,
      bytes: buffer.length,
      source: "generated",
      fileKey: uploaded?.key,
    });
  }

  const indexDoc = documents.find((d) => d.id === "evidence-index");
  return {
    documents,
    packageUrl: indexDoc?.fileUrl ?? documents.find((d) => d.fileUrl)?.fileUrl ?? null,
    packageExpiresAt: expiresAt,
  };
}

export async function refreshDocumentUrl(fileKey: string): Promise<string | null> {
  return getPresignedUrl(fileKey, PRESIGNED_EXPIRY_SECONDS);
}
