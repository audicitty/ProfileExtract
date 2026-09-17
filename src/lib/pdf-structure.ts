/**
 * PDF -> positioned text items.
 *
 * idea.md §1.2: `parseResume` hands the raw PDF to Gemini multimodally, which reads
 * content but reveals nothing about structure. Every check in checks/registry.yaml is a
 * statement about structure, so the structural layer needs coordinates, not prose.
 *
 * unpdf is used rather than pdfjs-dist directly: it ships a serverless build of PDF.js
 * with no worker, no canvas and no DOM, which is what a Next.js route handler can load.
 * (pdfjs-dist stays a devDependency for the bench, which runs in plain Node.)
 *
 * Nothing here interprets the resume. It only reads the file.
 */
import { getDocumentProxy } from "unpdf";

import { buildPageLines, renderLinesAsText } from "./resume-ats";
import type { PdfPage, PdfTextItem, ResumeDocument } from "./types";

/** The shape PDF.js hands back for one text item. */
type RawTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
};

/**
 * Reads every text item out of a PDF, keeping flow order and page geometry.
 *
 * Local and deterministic: no network, no model. The only impurity is reading the bytes
 * that were handed in.
 */
export async function extractResumeDocument(bytes: Uint8Array): Promise<ResumeDocument> {
  const pdf = await getDocumentProxy(bytes);

  const pages: PdfPage[] = [];
  const items: PdfTextItem[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const [x0, y0, x1, y1] = page.view as number[];
      const content = await page.getTextContent();

      const pageItems: PdfTextItem[] = [];
      for (const raw of content.items as RawTextItem[]) {
        const text = raw.str ?? "";
        if (!text.trim()) continue;
        const transform = raw.transform ?? [0, 0, 0, 0, 0, 0];
        const item: PdfTextItem = {
          page: pageNumber,
          flow_index: items.length + pageItems.length,
          text,
          x: transform[4],
          y: transform[5],
          width: raw.width ?? 0,
          height: raw.height ?? 0,
          // The vertical scale of the text matrix is the rendered font size.
          font_size: Math.abs(transform[3]) || raw.height || 0,
          font_name: raw.fontName ?? "",
        };
        pageItems.push(item);
      }

      items.push(...pageItems);
      pages.push({
        number: pageNumber,
        width: x1 - x0,
        height: y1 - y0,
        x_origin: x0,
        y_origin: y0,
        items: pageItems,
      });
    }
  } finally {
    await pdf.loadingTask.destroy();
  }

  const text = pages
    .map((page) => renderLinesAsText(buildPageLines(page)))
    .join("\n\n")
    .trim();

  return { page_count: pages.length, pages, items, text };
}
