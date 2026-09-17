/**
 * Measures structural properties of each fixture PDF itself, independent of any parser.
 *
 *   node bench/analyze-layout.mjs        # writes bench/results/layout.json
 *
 * Why this exists: both bench oracles read a PDF in content-stream order (pdfjs returns
 * items in paint order; pdfminer.six follows its own layout analysis over the same
 * stream). Neither sorts text top-to-bottom across the page. A parser that DOES sort that
 * way - which is the usual explanation for two-column resumes breaking in ATS software -
 * would see a different reading order, and this bench cannot observe that through its
 * oracles. So the ambiguity is measured directly on the fixture instead:
 *
 *   order_agreement       how much a top-to-bottom, left-to-right reading of the page
 *                         agrees with the document's own flow order (1 = identical)
 *   side_by_side_ratio    share of visual lines that contain two or more horizontally
 *                         separated blocks of text, i.e. genuinely columnar lines
 *   text_layer_chars      characters recoverable from the text layer at all
 *
 * These are facts about the file, not claims about any ATS.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { FIXTURES } from "./fixtures.mjs";
import { BENCH_DIR, PDF_DIR, RESULTS_DIR } from "./paths.mjs";

const Y_TOLERANCE = 2; // points; items within this vertical distance count as one line
const COLUMN_GAP = 40; // points; horizontal gap that separates two blocks on one line

const readItems = async (pdfPath) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false })
    .promise;

  const items = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    textContent.items.forEach((item, index) => {
      if (!item.str || !item.str.trim()) return;
      items.push({
        page: pageNumber,
        flowIndex: items.length,
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width ?? 0,
      });
    });
  }
  return items;
};

/** Fraction of consecutive pairs in flow order that stay consecutive when read visually. */
const orderAgreement = (items) => {
  if (items.length < 2) return 1;
  const visual = [...items].sort(
    (a, b) => a.page - b.page || b.y - a.y || a.x - b.x
  );
  const positionInVisual = new Map(visual.map((item, index) => [item.flowIndex, index]));
  let adjacent = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const here = positionInVisual.get(items[i].flowIndex);
    const next = positionInVisual.get(items[i + 1].flowIndex);
    if (next - here === 1) adjacent++;
  }
  return adjacent / (items.length - 1);
};

/** Share of visual lines made of two or more horizontally separated blocks. */
const sideBySideRatio = (items) => {
  const lines = [];
  for (const item of [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)) {
    const last = lines[lines.length - 1];
    if (last && last.page === item.page && Math.abs(last.y - item.y) <= Y_TOLERANCE) {
      last.items.push(item);
    } else {
      lines.push({ page: item.page, y: item.y, items: [item] });
    }
  }
  if (!lines.length) return 0;

  const columnar = lines.filter((line) => {
    const sorted = [...line.items].sort((a, b) => a.x - b.x);
    return sorted.some(
      (item, index) => index > 0 && item.x - (sorted[index - 1].x + sorted[index - 1].width) > COLUMN_GAP
    );
  });
  return columnar.length / lines.length;
};

const round = (value) => Math.round(value * 1000) / 1000;

export const analyzeFixtures = async () => {
  const results = [];
  for (const fixture of FIXTURES) {
    const pdfPath = path.join(PDF_DIR, `${fixture.id}.pdf`);
    const items = await readItems(pdfPath);
    // With no text layer there is no reading order to agree or disagree about, so these
    // report null rather than a vacuous 1.0.
    const hasText = items.length > 0;
    results.push({
      id: fixture.id,
      dimension: fixture.dimension,
      text_layer_chars: items.reduce((sum, item) => sum + item.text.trim().length, 0),
      text_items: items.length,
      order_agreement: hasText ? round(orderAgreement(items)) : null,
      side_by_side_ratio: hasText ? round(sideBySideRatio(items)) : null,
    });
  }

  const payload = {
    generated_at: new Date().toISOString(),
    note:
      "Properties of the fixture PDFs themselves, not parser results. order_agreement " +
      "compares a top-to-bottom visual reading against the file's own flow order.",
    y_tolerance_points: Y_TOLERANCE,
    column_gap_points: COLUMN_GAP,
    fixtures: results,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    path.join(RESULTS_DIR, "layout.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
  return payload;
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(path.join(BENCH_DIR, "analyze-layout.mjs"))) {
  const payload = await analyzeFixtures();
  for (const row of payload.fixtures) {
    console.log(
      `${row.id.padEnd(24)} chars=${String(row.text_layer_chars).padStart(5)} ` +
        `order_agreement=${row.order_agreement} side_by_side=${row.side_by_side_ratio}`
    );
  }
  process.exit(0);
}
