import PDFDocument from "pdfkit";

function money(n: number): string {
  return Number(n ?? 0).toFixed(2);
}

/** PDF uses the same period, accounts, amounts, and void/reverse rules as the JSON. */
export async function generateLedgerReportPdf(
  kind: "trial-balance" | "general-ledger",
  data: Record<string, unknown>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const period = data.period as
      | { type?: string; year?: number; month?: number | null; startDate?: string; endDate?: string }
      | undefined;
    const title = kind === "trial-balance" ? "Trial Balance" : "General Ledger";
    const subtitle = period
      ? `${period.startDate ?? ""} – ${period.endDate ?? ""}`
      : `As at ${String(data.asAt ?? "")}`;

    doc.fontSize(16).text(title);
    doc.moveDown(0.25);
    doc.fontSize(10).text(subtitle);
    doc.moveDown();

    if (kind === "trial-balance") {
      const totals = data.totals as { debit?: number; credit?: number } | undefined;
      doc.fontSize(10).text(
        `Totals  Dr ${money(totals?.debit ?? 0)}   Cr ${money(totals?.credit ?? 0)}`,
      );
      doc.moveDown(0.5);
      for (const section of (data.sections as Array<{
        label: string;
        debit: number;
        credit: number;
        lines?: Array<{ code: string; name: string; debit: number; credit: number }>;
      }>) ?? []) {
        doc.fontSize(12).text(
          `${section.label}  Dr ${money(section.debit)}  Cr ${money(section.credit)}`,
        );
        for (const line of section.lines ?? []) {
          doc
            .fontSize(9)
            .text(
              `${line.code}  ${line.name}    Dr ${money(line.debit)}    Cr ${money(line.credit)}`,
            );
        }
        doc.moveDown(0.4);
      }
    }

    if (kind === "general-ledger") {
      for (const account of (data.accounts as Array<{
        code: string;
        name: string;
        openingDebit: number;
        openingCredit: number;
        periodDebit: number;
        periodCredit: number;
        closingDebit: number;
        closingCredit: number;
        entries?: Array<{
          date: string;
          description: string;
          debit: number;
          credit: number;
          isReversal: boolean;
        }>;
      }>) ?? []) {
        doc.fontSize(11).text(`${account.code}  ${account.name}`);
        doc.fontSize(8).text(
          `Opening Dr ${money(account.openingDebit)} Cr ${money(account.openingCredit)}  |  Period Dr ${money(account.periodDebit)} Cr ${money(account.periodCredit)}  |  Closing Dr ${money(account.closingDebit)} Cr ${money(account.closingCredit)}`,
        );
        for (const entry of account.entries ?? []) {
          doc.fontSize(8).text(
            `${entry.date}  ${entry.description}    Dr ${money(entry.debit)}    Cr ${money(entry.credit)}`,
          );
        }
        doc.moveDown(0.4);
      }
    }

    doc.end();
  });
}
