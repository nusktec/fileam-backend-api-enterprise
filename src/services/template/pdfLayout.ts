import PDFDocument from "pdfkit";

type PdfDoc = InstanceType<typeof PDFDocument>;

export const PDF_MARGIN = 50;
export const PDF_GAP = 8;
export const PDF_AMT_COL_W = 98;

export type PdfLayout = {
  margin: number;
  contentWidth: number;
  left: number;
  rightEdge: number;
  amtColW: number;
  gap: number;
};

export function getPdfLayout(doc: PdfDoc): PdfLayout {
  const margin = PDF_MARGIN;
  const contentWidth = doc.page.width - margin * 2;
  const left = margin;
  const rightEdge = left + contentWidth;
  return {
    margin,
    contentWidth,
    left,
    rightEdge,
    amtColW: PDF_AMT_COL_W,
    gap: PDF_GAP,
  };
}

export function truncateText(text: string, maxLen: number): string {
  const t = (text ?? "").trim();
  if (t.length <= maxLen) return t || "—";
  return `${t.slice(0, maxLen - 1)}…`;
}

export function textHeight(
  doc: PdfDoc,
  text: string,
  width: number,
  fontSize: number,
): number {
  doc.fontSize(fontSize);
  return doc.heightOfString(text || "—", { width: Math.max(1, width) });
}

/** Three amount columns (Amount, VAT, Total) anchored to the right edge. */
export function amountColumnX(layout: PdfLayout, indexFromRight: 0 | 1 | 2): number {
  const { rightEdge, amtColW, gap } = layout;
  if (indexFromRight === 0) return rightEdge - amtColW;
  if (indexFromRight === 1) return rightEdge - amtColW - gap - amtColW;
  return rightEdge - amtColW * 3 - gap * 2;
}

export function drawKeyValueBox(
  doc: PdfDoc,
  layout: PdfLayout,
  startY: number,
  rows: { label: string; value: string }[],
  options?: { rowHeight?: number; boxPad?: number },
): number {
  const pad = options?.boxPad ?? 12;
  const rowH = options?.rowHeight ?? 22;
  const boxH = pad * 2 + rows.length * rowH;
  const { left, contentWidth, rightEdge } = layout;

  doc.rect(left, startY, contentWidth, boxH).fillAndStroke("#f8fafc", "#008b8b");
  let y = startY + pad;
  const valueX = rightEdge - layout.amtColW - pad;
  const valueW = layout.amtColW + 20;
  const labelW = valueX - left - pad - layout.gap;

  for (const row of rows) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#1a1a1a")
      .text(row.label, left + pad, y, { width: labelW, lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#4a4a4a")
      .text(row.value, valueX, y, { width: valueW, align: "right", lineBreak: false });
    y += rowH;
  }
  doc.font("Helvetica").fillColor("#1a1a1a");
  return startY + boxH;
}

export function ensurePageSpace(
  doc: PdfDoc,
  y: number,
  needed: number,
  top = PDF_MARGIN,
): number {
  const bottom = doc.page.height - PDF_MARGIN;
  if (y + needed <= bottom) return y;
  doc.addPage();
  return top;
}

/** Build column x positions left-to-right; trailing entries use fixed width, first column fills remainder. */
export function tableColumns(
  layout: PdfLayout,
  padLeft: number,
  specs: { key: string; width: number; fromRight?: boolean }[],
): Record<string, { x: number; w: number }> {
  const { left, rightEdge, gap } = layout;
  const out: Record<string, { x: number; w: number }> = {};
  const fromRight = specs.filter((s) => s.fromRight);
  const fromLeft = specs.filter((s) => !s.fromRight);
  let xRight = rightEdge;
  for (let i = fromRight.length - 1; i >= 0; i--) {
    const s = fromRight[i]!;
    xRight -= s.width;
    out[s.key] = { x: xRight, w: s.width };
    xRight -= gap;
  }
  let xLeft = left + padLeft;
  const lastLeft = fromLeft[fromLeft.length - 1];
  for (let i = 0; i < fromLeft.length; i++) {
    const s = fromLeft[i]!;
    const w =
      s === lastLeft
        ? Math.max(40, xRight - gap - xLeft)
        : s.width;
    out[s.key] = { x: xLeft, w };
    xLeft += w + gap;
  }
  return out;
}
