// --- profex bench replacement for open-resume's read-pdf.ts ---
// Upstream reads the PDF in the browser with pdfjs-dist v3 and a worker entry point.
// The bench runs in Node against a file on disk with pdfjs-dist v5, so this file is
// ours, not upstream's. It returns the identical TextItem[] shape, so every downstream
// vendored module is used unmodified. See NOTICE.md.
import { readFile } from "node:fs/promises";
import type { TextItems } from "./types";

export const readPdf = async (filePath: string): Promise<TextItems> => {
  // Legacy build is the Node-compatible one; the worker runs in-process.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(await readFile(filePath));
  const pdfFile = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  let textItems: TextItems = [];

  for (let i = 1; i <= pdfFile.numPages; i++) {
    const page = await pdfFile.getPage(i);
    const textContent = await page.getTextContent();

    // Loads font data so commonObjs can resolve the original font names, which
    // extract-profile/subsections rely on to detect bold text.
    await page.getOperatorList();
    const commonObjs = page.commonObjs;

    const pageTextItems = textContent.items
      .filter((item: any) => typeof item.str === "string")
      .map((item: any) => {
        const { str: text, dir, transform, fontName: pdfFontName, ...rest } = item;

        // Extract original font name from the loaded font data, as pdfjs renames fonts.
        let fontName = pdfFontName ?? "";
        try {
          const fontObj = commonObjs.get(pdfFontName);
          fontName = fontObj?.name ?? fontName;
        } catch {
          // Font not in commonObjs (happens for some embedded subsets) - keep pdfjs's name.
        }

        // pdfjs's text value uses non-breaking space, which upstream normalises away.
        const newText = text.replace(/ /g, " ");

        return {
          ...rest,
          fontName,
          text: newText,
          x: transform[4],
          y: transform[5],
        };
      });

    textItems.push(...pageTextItems);
  }

  // pdfjs v5 reports end-of-line on its own zero-width item rather than on the text item
  // that ends the line, which v3 (what upstream was written against) did not do. Dropping
  // those empty items without folding their flag back would leave every item hasEOL:false,
  // and group-text-items-into-lines would collapse the whole page into one line. So the
  // flag is carried onto the preceding real item before the empties are removed.
  const isEmptySpace = (textItem: { text: string }) => !textItem.text.trim();
  for (let i = 0; i < textItems.length; i++) {
    const item = textItems[i] as any;
    if (!isEmptySpace(item) || !item.hasEOL) continue;
    for (let j = i - 1; j >= 0; j--) {
      const previous = textItems[j] as any;
      if (isEmptySpace(previous)) continue;
      previous.hasEOL = true;
      break;
    }
  }
  textItems = textItems.filter((textItem) => !isEmptySpace(textItem as any));

  return textItems as TextItems;
};
