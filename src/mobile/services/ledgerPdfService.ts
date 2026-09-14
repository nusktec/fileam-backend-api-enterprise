import PDFDocument from "pdfkit";

/** PDF mirrors the JSON ledger report (same period, accounts, amounts). */
export async function generateLedgerReportPdf(
  kind: "trial-balance" | "general-ledger",
  data: Record<string, unknown>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const title =
      kind === "trial-balance" ? "Trial Balance" : "General Ledger";
    const period = data.period as
      | { startDate?: string; endDate?: string }
      | undefined;
    const subtitle = period
      ? `${period.startDate ?? ""} – ${period.endDate ?? ""}`
      : `As at ${String(data.asAt ?? "")}`;

    doc.fontSize(18).text(title, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(subtitle);
    doc.moveDown();

    if (kind === "trial-balance" && Array.isArray(data.sections)) {
      for (const section of data.sections as Array<{
        label: string;
        lines?: Array<{
          code: string;
          name: string;
          debit: number;
          credit: number;
        }>;
      }>) {
        doc.fontSize(12).text(section.label, { underline: true });
        for (const line of section.lines ?? []) {
          doc
            .fontSize(9)
            .text(
              `${line.code} ${line.name} — Dr ${line.debit.toFixed(2)} / Cr ${line.credit.toFixed(2)}`,
            );
        }
        doc.moveDown(0.5);
      }
    }

    if (kind === "general-ledger" && Array.isArray(data.accounts)) {
      for (const account of data.accounts as Array<{
        code: string;
        name: string;
        closingDebit: number;
        closingCredit: number;
      }>) {
        doc
          .fontSize(10)
          .text(
            `${account.code} ${account.name} — Closing Dr ${account.closingDebit.toFixed(2)} / Cr ${account.closingCredit.toFixed(2)}`,
          );
      }
    }

    doc.end();
  });
}
