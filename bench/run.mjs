/**
 * Bench runner: fixture x parser -> field-extraction accuracy.
 *
 *   node bench/run.mjs            # all fixtures
 *   node bench/run.mjs 02 07      # only fixtures whose id contains these strings
 *
 * Writes bench/results/matrix.json, matrix.md, severity.json and severity.md.
 * Every number in those files comes from a parser run here; nothing is estimated.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import { FIXTURES } from "./fixtures.mjs";
import { BENCH_DIR, PDF_DIR, RESULTS_DIR, benchPython } from "./paths.mjs";
import { analyzeFixtures } from "./analyze-layout.mjs";
import {
  scoreOpenResume,
  scorePyresparser,
  accuracy,
  OPEN_RESUME_PROBES,
  PYRESPARSER_PROBES,
} from "./score.mjs";

const PARSERS = {
  "open-resume": {
    probes: OPEN_RESUME_PROBES,
    score: scoreOpenResume,
    run: (pdfPath) =>
      // tsx's CLI is invoked through node directly: spawning npx.cmd fails with EINVAL
      // on Windows unless a shell is used, and a shell is not needed here.
      spawnSync(
        process.execPath,
        [
          path.join(BENCH_DIR, "..", "node_modules", "tsx", "dist", "cli.mjs"),
          path.join(BENCH_DIR, "parsers", "openresume-adapter.mts"),
          pdfPath,
        ],
        { encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024 }
      ),
  },
  pyresparser: {
    probes: PYRESPARSER_PROBES,
    score: scorePyresparser,
    run: (pdfPath) =>
      spawnSync(
        benchPython(),
        [path.join(BENCH_DIR, "parsers", "pyresparser_adapter.py"), pdfPath],
        { encoding: "utf8", timeout: 300_000, maxBuffer: 32 * 1024 * 1024 }
      ),
  },
};

const runParser = (name, pdfPath) => {
  const result = PARSERS[name].run(pdfPath);
  if (result.error) return { __error__: `spawn: ${result.error.message}` };
  if (result.status !== 0) {
    return { __error__: `exit ${result.status}: ${(result.stderr || "").trim().slice(-300)}` };
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { __error__: `unparseable stdout: ${(result.stdout || "").slice(0, 200)}` };
  }
};

const pct = (value) => Math.round(value * 1000) / 10;

const main = async () => {
  const filters = process.argv.slice(2);
  const content = JSON.parse(readFileSync(path.join(BENCH_DIR, "content.json"), "utf8"));
  const fixtures = FIXTURES.filter(
    (fixture) => !filters.length || filters.some((f) => fixture.id.includes(f))
  );

  mkdirSync(RESULTS_DIR, { recursive: true });

  const rows = [];
  for (const fixture of fixtures) {
    const manifestPath = path.join(PDF_DIR, `${fixture.id}.manifest.json`);
    if (!existsSync(manifestPath)) {
      throw new Error(`missing ${manifestPath} - run: node bench/build-fixtures.mjs`);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const pdfPath = path.join(BENCH_DIR, manifest.pdf);

    const row = {
      id: fixture.id,
      dimension: fixture.dimension,
      label: fixture.label,
      varied_option: manifest.varied_option,
      parsers: {},
    };

    for (const parserName of Object.keys(PARSERS)) {
      process.stdout.write(`${fixture.id} / ${parserName} ... `);
      const raw = runParser(parserName, pdfPath);
      const scored = PARSERS[parserName].score(raw, manifest.expected, content);
      const acc = accuracy(scored.probes);
      row.parsers[parserName] = {
        accuracy: pct(acc),
        probes: Object.fromEntries(
          Object.entries(scored.probes).map(([k, v]) => [k, pct(v)])
        ),
        ...(scored.__error__ ? { error: scored.__error__ } : {}),
      };
      console.log(`${pct(acc)}%${scored.__error__ ? ` (${scored.__error__})` : ""}`);
    }

    rows.push(row);
  }

  const matrix = {
    generated_at: new Date().toISOString(),
    content_source: "bench/content.json",
    parsers: {
      "open-resume": {
        kind: "TypeScript, pdfjs-dist positioned text items",
        source: "https://github.com/xitanggg/open-resume (AGPL-3.0, vendored)",
        probes: OPEN_RESUME_PROBES,
      },
      pyresparser: {
        kind: "Python, pdfminer.six text + pyresparser extractors (two compatibility shims)",
        source: "pyresparser 1.0.6 (GPL-3.0) on PyPI",
        probes: PYRESPARSER_PROBES,
      },
    },
    fixtures: rows,
  };
  writeFileSync(
    path.join(RESULTS_DIR, "matrix.json"),
    `${JSON.stringify(matrix, null, 2)}\n`,
    "utf8"
  );

  const severity = computeSeverity(rows);
  writeFileSync(
    path.join(RESULTS_DIR, "severity.json"),
    `${JSON.stringify(severity, null, 2)}\n`,
    "utf8"
  );

  // Fixture-level structural facts (reading-order ambiguity, text layer presence) that no
  // parser can report, written alongside the parser results.
  await analyzeFixtures();

  writeFileSync(path.join(RESULTS_DIR, "matrix.md"), renderMatrixMd(matrix), "utf8");
  writeFileSync(path.join(RESULTS_DIR, "severity.md"), renderSeverityMd(severity), "utf8");

  console.log(`\nwrote ${path.relative(process.cwd(), RESULTS_DIR)}/{matrix,severity}.{json,md}`);
};

/**
 * Severity of a dimension = the drop in field-extraction accuracy versus the baseline
 * fixture, in accuracy points, per parser. No other definition is used anywhere.
 */
const computeSeverity = (rows) => {
  const baseline = rows.find((row) => row.dimension === "baseline");
  if (!baseline) {
    throw new Error("baseline fixture not in this run - severity needs it; run all fixtures");
  }

  const parserNames = Object.keys(baseline.parsers);
  const entries = rows
    .filter((row) => row.dimension !== "baseline")
    .map((row) => {
      const drops = {};
      for (const parser of parserNames) {
        drops[parser] =
          Math.round((baseline.parsers[parser].accuracy - row.parsers[parser].accuracy) * 10) / 10;
      }
      const values = Object.values(drops);
      const mean = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
      const flaggedBy = parserNames.filter((parser) => drops[parser] >= 5);
      const worstProbes = Object.fromEntries(
        parserNames.map((parser) => [
          parser,
          Object.entries(row.parsers[parser].probes)
            .filter(([probe]) => baseline.parsers[parser].probes[probe] > 0)
            .map(([probe, value]) => [probe, baseline.parsers[parser].probes[probe] - value])
            .filter(([, drop]) => drop > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([probe, drop]) => `${probe} -${Math.round(drop * 10) / 10}`),
        ])
      );

      return {
        fixture: row.id,
        dimension: row.dimension,
        varied_option: row.varied_option,
        label: row.label,
        drop_points: drops,
        mean_drop_points: mean,
        flagged_by: flaggedBy,
        confidence: flaggedBy.length >= 2 ? "both-parsers" : flaggedBy.length === 1 ? "single-parser" : "no-measured-drop",
        worst_probes: worstProbes,
      };
    })
    .sort((a, b) => b.mean_drop_points - a.mean_drop_points);

  return {
    generated_at: new Date().toISOString(),
    definition:
      "drop_points = baseline fixture accuracy minus this fixture's accuracy, in accuracy points, per parser",
    flag_threshold_points: 5,
    baseline_accuracy: Object.fromEntries(
      parserNames.map((parser) => [parser, baseline.parsers[parser].accuracy])
    ),
    dimensions: entries,
  };
};

const renderMatrixMd = (matrix) => {
  const parsers = Object.keys(matrix.parsers);
  const head = `| Fixture | Dimension | ${parsers.join(" | ")} |\n|---|---|${parsers
    .map(() => "---|")
    .join("")}\n`;
  const body = matrix.fixtures
    .map(
      (row) =>
        `| ${row.id} | ${row.dimension} | ${parsers
          .map((parser) => `${row.parsers[parser].accuracy}%`)
          .join(" | ")} |`
    )
    .join("\n");

  const probeTables = parsers
    .map((parser) => {
      const probes = matrix.parsers[parser].probes;
      const header = `| Fixture | ${probes.join(" | ")} |\n|---|${probes.map(() => "---|").join("")}`;
      const lines = matrix.fixtures
        .map(
          (row) =>
            `| ${row.id} | ${probes.map((probe) => row.parsers[parser].probes[probe]).join(" | ")} |`
        )
        .join("\n");
      return `### ${parser} — per-probe scores (%)\n\n${header}\n${lines}\n`;
    })
    .join("\n");

  return `# Parser bench matrix

Generated ${matrix.generated_at} by \`node bench/run.mjs\`. Field-extraction accuracy,
mean of that parser's probes. Parsers are comparable to themselves across fixtures,
not to each other.

${head}${body}

${probeTables}`;
};

const renderSeverityMd = (severity) => {
  const parsers = Object.keys(severity.baseline_accuracy);
  const rows = severity.dimensions
    .map(
      (entry) =>
        `| ${entry.fixture} | ${entry.dimension} | ${parsers
          .map((parser) => entry.drop_points[parser])
          .join(" | ")} | ${entry.mean_drop_points} | ${entry.confidence} |`
    )
    .join("\n");

  return `# Measured severity

Generated ${severity.generated_at} by \`node bench/run.mjs\`.

${severity.definition}. A dimension is "flagged" by a parser when its drop is at least
${severity.flag_threshold_points} accuracy points. Baseline accuracy: ${parsers
    .map((parser) => `${parser} ${severity.baseline_accuracy[parser]}%`)
    .join(", ")}.

| Fixture | Dimension | ${parsers.map((p) => `${p} drop`).join(" | ")} | Mean drop | Confidence |
|---|---|${parsers.map(() => "---|").join("")}---|---|
${rows}
`;
};

await main();
