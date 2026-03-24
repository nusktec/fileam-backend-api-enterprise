import { PDFDocument } from "pdf-lib";

/** Concatenate PDF buffers into one multi-page document (preserves page order). */
export async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 0) {
    throw new Error("mergePdfBuffers: no PDF buffers");
  }
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(new Uint8Array(buf));
    const indices = src.getPageIndices();
    const pages = await merged.copyPages(src, indices);
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  const out = await merged.save();
  return Buffer.from(out);
}
