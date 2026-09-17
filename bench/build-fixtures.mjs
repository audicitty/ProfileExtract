/**
 * Builds every fixture PDF plus its manifest.
 *
 *   node bench/build-fixtures.mjs [fixtureId ...]
 *
 * HTML is rendered to PDF by the locally installed Chrome in headless mode
 * (--no-pdf-header-footer, so Chrome does not inject its own date/URL header into the
 * text layer). The scanned fixture is produced by rasterising the baseline PDF through
 * bench/parsers/rasterize.py, so it is literally a photo of fixture 01.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { FIXTURES, optionsFor, BASELINE_OPTIONS } from "./fixtures.mjs";
import { renderFixture } from "./render-html.mjs";
import { BENCH_DIR, OUT_DIR, HTML_DIR, PDF_DIR, benchPython } from "./paths.mjs";

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

const rasterize = (sourcePdf, targetPdf) => {
  const result = spawnSync(
    benchPython(),
    [path.join(BENCH_DIR, "parsers", "rasterize.py"), sourcePdf, targetPdf],
    { encoding: "utf8", timeout: 120_000 }
  );
  if (result.status !== 0) {
    throw new Error(`rasterize.py failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
};

const main = () => {
  const only = process.argv.slice(2);
  const chrome = findChrome();
  const content = JSON.parse(readFileSync(path.join(BENCH_DIR, "content.json"), "utf8"));

  mkdirSync(HTML_DIR, { recursive: true });
  mkdirSync(PDF_DIR, { recursive: true });

  const built = [];
  for (const fixture of FIXTURES) {
    if (only.length && !only.includes(fixture.id)) continue;

    const options = optionsFor(fixture);
    const varied = Object.keys(fixture.change);
    if (varied.length > 1) {
      throw new Error(
        `${fixture.id} varies ${varied.length} options (${varied.join(", ")}). ` +
          `Fixtures must vary exactly one.`
      );
    }

    // The scanned fixture renders the baseline HTML, then rasterises the result.
    const renderOptions = fixture.change.rasterize ? BASELINE_OPTIONS : options;
    const { html, expected } = renderFixture(content, renderOptions);

    const htmlPath = path.join(HTML_DIR, `${fixture.id}.html`);
    const pdfPath = path.join(PDF_DIR, `${fixture.id}.pdf`);
    writeFileSync(htmlPath, html, "utf8");
    printToPdf(chrome, htmlPath, pdfPath);

    let note = "";
    if (options.rasterize) {
      note = rasterize(pdfPath, pdfPath);
    }

    const manifest = {
      id: fixture.id,
      dimension: fixture.dimension,
      label: fixture.label,
      varied_option: varied[0] ?? null,
      varied_value: varied.length ? fixture.change[varied[0]] : null,
      baseline_value: varied.length ? BASELINE_OPTIONS[varied[0]] : null,
      options,
      pdf: path.relative(BENCH_DIR, pdfPath).replace(/\\/g, "/"),
      expected,
      ...(note ? { render_note: note } : {}),
    };
    writeFileSync(
      path.join(PDF_DIR, `${fixture.id}.manifest.json`),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    built.push(fixture.id);
    console.log(`built ${fixture.id}${note ? ` (${note})` : ""}`);
  }

  console.log(`\n${built.length} fixtures in ${path.relative(process.cwd(), PDF_DIR)}`);
};

main();
