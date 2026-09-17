/**
 * Bench oracle A: open-resume (vendored, AGPL-3.0 — see open-resume/NOTICE.md).
 *
 * Usage: tsx bench/parsers/openresume-adapter.mts <fixture.pdf>
 * Prints the parser's raw output as JSON on stdout.
 */
import { parseResumeFromPdf } from "./open-resume/index.ts";

const [, , pdfPath] = process.argv;
if (!pdfPath) {
  console.error("usage: openresume-adapter.mts <fixture.pdf>");
  process.exit(2);
}

const resume = await parseResumeFromPdf(pdfPath);
process.stdout.write(JSON.stringify(resume));
// pdfjs keeps handles open; the bench is a one-shot process.
process.exit(0);
