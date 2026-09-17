/**
 * Emits checks/registry.yaml by joining checks/checks.mjs (statements, layers, assertions)
 * to bench/results/severity.json (measurements) on fixture id.
 *
 *   node bench/build-registry.mjs
 *
 * A severity can therefore only appear in the registry if a bench run produced it. Checks
 * with no fixture get `severity_points: null` and `severity_status: placeholder-untested`
 * or `not-bench-measurable`, never a number.
 *
 * The YAML is written by hand rather than with a library, to avoid adding a dependency for
 * a dev tool. Values are quoted and newlines are stripped, so the output stays valid.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CHECKS } from "../checks/checks.mjs";
import { BENCH_DIR, RESULTS_DIR } from "./paths.mjs";

const REGISTRY_PATH = path.join(BENCH_DIR, "..", "checks", "registry.yaml");
// Same content as the YAML. Phase 3 reads this one, so product code never needs a YAML
// parser dependency to get at the weights.
const REGISTRY_JSON_PATH = path.join(BENCH_DIR, "..", "checks", "registry.json");

/** YAML double-quoted scalar: backslash first, then the quote character. */
const quote = (value) =>
  `"${String(value)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}"`;

const statusFor = (check) => {
  if (check.layer === "llm") return "not-bench-measurable";
  if (check.layer === "untested") return "placeholder-untested";
  return "measured";
};

export const buildRegistry = () => {
  const severity = JSON.parse(
    readFileSync(path.join(RESULTS_DIR, "severity.json"), "utf8")
  );
  const matrix = JSON.parse(readFileSync(path.join(RESULTS_DIR, "matrix.json"), "utf8"));
  const byFixture = new Map(severity.dimensions.map((entry) => [entry.fixture, entry]));
  const parsers = Object.keys(severity.baseline_accuracy);
  const json = {
    generated_by: "node bench/build-registry.mjs",
    severity_definition: severity.definition,
    bench_run_at: matrix.generated_at,
    flag_threshold_points: severity.flag_threshold_points,
    parsers: parsers.map((parser) => ({
      name: parser,
      kind: matrix.parsers[parser].kind,
      source: matrix.parsers[parser].source,
      baseline_accuracy_pct: severity.baseline_accuracy[parser],
    })),
    checks: [],
  };

  const lines = [];
  lines.push("# ATS check registry - generated, do not hand-edit.");
  lines.push("#");
  lines.push("# Produced by: node bench/build-registry.mjs");
  lines.push("# Statements and assertions come from checks/checks.mjs.");
  lines.push("# Every severity_points value is a measurement from bench/results/severity.json:");
  lines.push(`# ${severity.definition}.`);
  lines.push("# Checks with no fixture carry severity_points: null and say why.");
  lines.push("");
  // No generated_at field: the registry must be reproducible from the same bench results,
  // so the only timestamp it carries is when the measurement itself ran.
  lines.push(`bench_run_at: ${quote(matrix.generated_at)}`);
  lines.push("parsers:");
  for (const parser of parsers) {
    lines.push(`  - name: ${quote(parser)}`);
    lines.push(`    kind: ${quote(matrix.parsers[parser].kind)}`);
    lines.push(`    source: ${quote(matrix.parsers[parser].source)}`);
    lines.push(`    baseline_accuracy_pct: ${severity.baseline_accuracy[parser]}`);
  }
  lines.push(`flag_threshold_points: ${severity.flag_threshold_points}`);
  lines.push("");
  lines.push("checks:");

  const ordered = [...CHECKS].sort((a, b) => {
    const sa = byFixture.get(a.fixture)?.mean_drop_points ?? -1;
    const sb = byFixture.get(b.fixture)?.mean_drop_points ?? -1;
    return sb - sa;
  });

  for (const check of ordered) {
    const measured = check.fixture ? byFixture.get(check.fixture) : null;
    if (check.fixture && !measured) {
      throw new Error(
        `check ${check.id} names fixture ${check.fixture}, which is not in severity.json`
      );
    }

    lines.push(`  - id: ${quote(check.id)}`);
    lines.push(`    statement: ${quote(check.statement)}`);
    lines.push(`    layer: ${quote(check.layer)}`);
    lines.push(`    severity_status: ${quote(statusFor(check))}`);

    if (measured) {
      lines.push(`    severity_points: ${measured.mean_drop_points}`);
      lines.push("    severity_by_parser:");
      for (const parser of parsers) {
        lines.push(`      ${parser}: ${measured.drop_points[parser]}`);
      }
      lines.push(
        `    parsers_agreed: ${
          measured.flagged_by.length
            ? `[${measured.flagged_by.map((p) => quote(p)).join(", ")}]`
            : "[]"
        }`
      );
      lines.push(`    confidence: ${quote(measured.confidence)}`);
      lines.push(`    evidence_fixture: ${quote(check.fixture)}`);
      const probeNotes = parsers
        .flatMap((parser) => measured.worst_probes[parser].map((note) => `${parser}: ${note}`))
        .join("; ");
      lines.push(`    fields_lost: ${quote(probeNotes || "none")}`);
    } else {
      lines.push("    severity_points: null");
      lines.push(
        `    severity_note: ${quote(
          check.layer === "llm"
            ? "Content judgement: a parser bench cannot measure it. Never assign this a bench-derived weight."
            : "No fixture built for this dimension yet, so no severity has been measured."
        )}`
      );
      lines.push("    parsers_agreed: []");
      lines.push(`    confidence: ${quote("unmeasured")}`);
    }

    lines.push(`    assertion: ${quote(check.assertion)}`);
    if (check.caveat) lines.push(`    caveat: ${quote(check.caveat)}`);
    if (check.source_hypothesis) {
      lines.push(`    hypothesis_source: ${quote(check.source_hypothesis)}`);
    }
    lines.push("");

    json.checks.push({
      id: check.id,
      statement: check.statement,
      layer: check.layer,
      severity_status: statusFor(check),
      severity_points: measured ? measured.mean_drop_points : null,
      severity_by_parser: measured ? measured.drop_points : null,
      parsers_agreed: measured ? measured.flagged_by : [],
      confidence: measured ? measured.confidence : "unmeasured",
      evidence_fixture: check.fixture,
      assertion: check.assertion,
      ...(check.caveat ? { caveat: check.caveat } : {}),
      ...(check.source_hypothesis ? { hypothesis_source: check.source_hypothesis } : {}),
    });
  }

  return { yaml: `${lines.join("\n").trimEnd()}\n`, json };
};

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(path.join(BENCH_DIR, "build-registry.mjs"));

if (isDirectRun) {
  const { yaml, json } = buildRegistry();
  writeFileSync(REGISTRY_PATH, yaml, "utf8");
  writeFileSync(REGISTRY_JSON_PATH, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  console.log(
    `wrote ${path.relative(process.cwd(), REGISTRY_PATH)} and ` +
      `${path.relative(process.cwd(), REGISTRY_JSON_PATH)} (${CHECKS.length} checks)`
  );
}

export { REGISTRY_PATH, REGISTRY_JSON_PATH };
