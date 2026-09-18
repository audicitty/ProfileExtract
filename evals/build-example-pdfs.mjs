/**
 * Renders the example fixtures' `resume.txt` into the `resume.pdf` the structural grader
 * reads.
 *
 *   node evals/build-example-pdfs.mjs
 *
 * Only fixtures whose `expected.json` sets `"render_pdf": true` are touched, and only the
 * five shipped examples set it. A real fixture's PDF is the file a real person exported
 * from Word or Overleaf — that is the artefact under test, and this script must never
 * overwrite one. The committed example PDFs are checked in so `npm run check` works on a
 * fresh clone without Chrome.
 *
 * Plain-text conventions in `resume.txt`:
 *   - line 1              the name
 *   - ALL CAPS short line a section heading
 *   - "- " prefix         a bullet; an indented following line continues it
 *
 * The layout is deliberately ATS-plain — one column, one font, no tables, no icons — so
 * these PDFs exercise the happy path of `checks/registry.json`. Fixtures that test broken
 * layout should be real resumes that are actually broken, not rendered imitations.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { EVALS_DIR, FIXTURES_DIR } from "./fixtures.mjs";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const findChrome = () => {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Chrome not found. Tried:\n  ${CHROME_CANDIDATES.join("\n  ")}\nSet CHROME_PATH.`
    );
  }
  return found;
};

const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const isHeading = (line) =>
  line === line.toUpperCase() && /[A-Z]/.test(line) && line.trim().split(/\s+/).length <= 4;

/** Plain resume text -> single-column HTML. Bullets carry a real "•" in the text layer. */
export function resumeTextToHtml(text) {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");

  // Join wrapped bullet continuations back onto their bullet.
  const lines = [];
  for (const raw of rawLines) {
    const isContinuation = /^\s+\S/.test(raw) && lines.length && lines.at(-1).startsWith("- ");
    if (isContinuation) lines[lines.length - 1] += ` ${raw.trim()}`;
    else lines.push(raw.trim());
  }

  const body = [];
  lines.forEach((line, index) => {
    if (!line) {
      body.push('<div class="gap"></div>');
      return;
    }
    if (index === 0) {
      body.push(`<div class="name">${escapeHtml(line)}</div>`);
      return;
    }
    if (isHeading(line)) {
      body.push(`<div class="heading">${escapeHtml(line)}</div>`);
      return;
    }
    if (line.startsWith("- ")) {
      body.push(`<div class="bullet">\u2022 ${escapeHtml(line.slice(2))}</div>`);
      return;
    }
    body.push(`<div class="line">${escapeHtml(line)}</div>`);
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 15mm 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.35;
         color: #000; margin: 0; }
  .name { font-size: 18pt; font-weight: bold; margin-bottom: 2pt; }
  .heading { font-size: 12.5pt; font-weight: bold; margin: 9pt 0 3pt; }
  .bullet { margin-left: 12pt; text-indent: -12pt; }
  .gap { height: 5pt; }
</style>
</head>
<body>
${body.join("\n")}
</body>
</html>
`;
}

const printToPdf = (chrome, htmlPath, pdfPath) => {
  const result = spawnSync(
    chrome,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=4000",
      `--print-to-pdf=${path.resolve(pdfPath)}`,
      pathToFileURL(path.resolve(htmlPath)).href,
    ],
    { encoding: "utf8", timeout: 60_000 }
  );
  if (!existsSync(pdfPath)) {
    throw new Error(
      `Chrome produced no PDF for ${htmlPath}\n${result.stderr ?? ""}${result.stdout ?? ""}`
    );
  }
};

const main = () => {
  // The fixture directories are read directly rather than through `loadFixtures`: a
  // fixture whose PDF has not been rendered yet is invalid by that validator, which is
  // the point of this script.
  const ids = readdirSync(FIXTURES_DIR)
    .filter((entry) => statSync(path.join(FIXTURES_DIR, entry)).isDirectory())
    .sort();

  const chrome = findChrome();
  const htmlDir = path.join(EVALS_DIR, "out", "html");
  mkdirSync(htmlDir, { recursive: true });

  let built = 0;
  for (const id of ids) {
    const dir = path.join(FIXTURES_DIR, id);
    const expectedPath = path.join(dir, "expected.json");
    if (!existsSync(expectedPath)) continue;
    const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
    if (expected.render_pdf !== true) continue;

    const textPath = path.join(dir, "resume.txt");
    if (!existsSync(textPath)) {
      console.error(`${id}: render_pdf is set but there is no resume.txt`);
      process.exit(1);
    }

    const html = resumeTextToHtml(readFileSync(textPath, "utf8"));
    const htmlPath = path.join(htmlDir, `${id}.html`);
    writeFileSync(htmlPath, html, "utf8");
    printToPdf(chrome, htmlPath, path.join(dir, "resume.pdf"));
    console.log(`  built ${id}/resume.pdf`);
    built += 1;
  }

  console.log(`\n${built} example PDF(s) rendered with ${chrome}.`);
  console.log("Re-pin the structural expectations next: npm run check -- --structure-only");
};

main();
