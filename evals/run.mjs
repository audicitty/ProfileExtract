/**
 * Regression check runner (idea.md §6).
 *
 *   npm run check                       # every fixture, model + structure
 *   npm run check -- 03 05              # only fixtures whose id contains these strings
 *   npm run check -- --structure-only   # no model calls, no cost: resume-ats.ts only
 *   npm run check -- --no-write         # print, do not touch evals/baseline/
 *
 * This is a safety net, not an eval harness. It calls the real pipeline
 * (`parseResume` from `src/lib/resume.ts`) once per fixture, grades the result with the
 * deterministic graders in `graders.mjs`, reuses `auditResumeStructure` from
 * `src/lib/resume-ats.ts` as the structural grader, and overwrites
 * `evals/baseline/baseline.json` + `baseline.md`. A `--structure-only` run writes to
 * `evals/out/` instead, so it can never replace the committed baseline with a partial one.
 *
 * The committed baseline is the point: after a prompt change you run this and read
 * `git diff evals/baseline/` to see what moved. Nothing here is wired into CI and nothing
 * here gates a commit.
 *
 * It observes the pipeline; it does not change it. No file under `src/` is written to,
 * and no pipeline behaviour is monkey-patched.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  CONTACT_FIELDS,
  aggregate,
  contactFieldMatch,
  seniorityMatch,
  skillSetScore,
  structureMatch,
  validateParsedResume,
  yearsError,
} from "./graders.mjs";
import {
  BASELINE_DIR,
  EVALS_DIR,
  TARGET_FIXTURE_COUNT,
  fixturePdf,
  fixtureText,
  loadFixtures,
} from "./fixtures.mjs";

/** The API key lives in .env.local, which Next loads for the app but Node does not. */
const loadEnvLocal = () => {
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env.local"));
  } catch {
    /* Absent or unreadable: parseResume will say so itself, with a better message. */
  }
};

const parseArgs = (argv) => {
  const options = { filter: [], structureOnly: false, write: true };
  for (const arg of argv) {
    if (arg === "--structure-only") options.structureOnly = true;
    else if (arg === "--no-write") options.write = false;
    else if (arg.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
    else options.filter.push(arg);
  }
  return options;
};

const gitCommit = () => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

const pct = (value) => (value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`);
const num = (value) => (value === null || value === undefined ? "n/a" : String(value));

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnvLocal();

  const { fixtures, problems } = loadFixtures({ filter: options.filter });

  if (problems.length) {
    console.error("Fixture problems — fix these before running:\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  if (!fixtures.length) {
    console.error("No fixtures matched. Add some under evals/fixtures/ (see evals/README.md).");
    process.exit(1);
  }

  // Imported here, after env loading, and dynamically so that --structure-only never
  // pulls the Gemini client in at all.
  const { extractResumeDocument } = await import("../src/lib/pdf-structure.ts");
  const { auditResumeStructure, ATS_REGISTRY } = await import("../src/lib/resume-ats.ts");
  const parseResume = options.structureOnly
    ? null
    : (await import("../src/lib/resume.ts")).parseResume;

  const realCount = fixtures.filter((fixture) => !fixture.example).length;
  console.log(
    `Running ${fixtures.length} fixture(s): ${realCount} real, ` +
      `${fixtures.length - realCount} example${options.structureOnly ? " — structure only" : ""}`
  );
  if (realCount < TARGET_FIXTURE_COUNT) {
    console.log(
      `Note: ${realCount} real fixture(s). idea.md §6 asks for ~${TARGET_FIXTURE_COUNT}-20. ` +
        `Examples do not count as coverage — see the checklist in evals/README.md.`
    );
  }
  console.log("");

  const rows = [];

  for (const fixture of fixtures) {
    const row = {
      id: fixture.id,
      example: fixture.example,
      shape: fixture.shape,
      input: fixture.input,
      parse_ok: false,
    };

    /* ---- structural grader: src/lib/resume-ats.ts, no model involved ---- */
    let audit = null;
    if (fixture.pdf_path) {
      try {
        const bytes = new Uint8Array(fixturePdf(fixture));
        const doc = await extractResumeDocument(bytes);
        audit = auditResumeStructure(doc);
        row.audit = {
          ats_score: audit.ats_score,
          status: audit.status,
          sub_scores: audit.sub_scores,
          failed_check_ids: audit.findings
            .filter((finding) => finding.status === "fail")
            .map((finding) => finding.check_id)
            .sort(),
        };
      } catch (error) {
        row.audit_error = error instanceof Error ? error.message : String(error);
      }
    }
    row.structure = structureMatch(fixture.structure, audit);

    /* ---- the model pipeline ---- */
    if (options.structureOnly) {
      row.parse_skipped = "structure-only run";
      rows.push(row);
      console.log(`  ${statusGlyph(row)} ${fixture.id.padEnd(34)} ${structureSummary(row)}`);
      continue;
    }

    let parsed = null;
    try {
      const text = fixtureText(fixture);
      parsed =
        fixture.input === "pdf"
          ? await parseResume({
              fileBase64: fixturePdf(fixture).toString("base64"),
              mimeType: "application/pdf",
            })
          : await parseResume({ text });
    } catch (error) {
      row.parse_error = error instanceof Error ? error.message : String(error);
    }

    if (parsed) {
      const validation = validateParsedResume(parsed);
      row.parse_ok = validation.valid;
      if (!validation.valid) row.json_problems = validation.problems;

      if (validation.valid) {
        const labels = fixture.labels;
        row.skills = skillSetScore(labels.skills, parsed.extracted_skills);
        row.seniority = {
          status:
            labels.seniority_level === undefined
              ? "not_labelled"
              : seniorityMatch(labels.seniority_level, parsed.seniority_level)
                ? "match"
                : "miss",
          expected: labels.seniority_level ?? null,
          actual: parsed.seniority_level,
        };
        row.years = {
          expected: labels.years_of_experience ?? null,
          actual: parsed.years_of_experience,
          abs_error: yearsError(labels.years_of_experience, parsed.years_of_experience),
        };
        row.contact = {};
        for (const field of CONTACT_FIELDS) {
          const labelKey = field === "candidate_name" ? "candidate_name" : field;
          row.contact[field] = contactFieldMatch(field, labels[labelKey], parsed[field]);
        }
      }
    }

    rows.push(row);
    console.log(`  ${statusGlyph(row)} ${fixture.id.padEnd(34)} ${rowSummary(row)}`);
  }

  const summary = aggregate(rows);
  const report = {
    generated_at: new Date().toISOString(),
    git_commit: gitCommit(),
    mode: options.structureOnly ? "structure-only" : "full",
    filter: options.filter,
    pipeline: {
      parsed_by: "parseResume() from src/lib/resume.ts",
      model_candidates: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-latest"],
      note:
        "resume.ts walks that candidate list and returns the first model that answers; " +
        "it does not report which one did. Temperature is 0.1, not 0, so small run-to-run " +
        "variation is expected and is not by itself a regression.",
      structural_grader: "auditResumeStructure() from src/lib/resume-ats.ts",
      registry_bench_run_at: ATS_REGISTRY.bench_run_at,
    },
    summary,
    fixtures: rows,
  };

  console.log("");
  console.log(renderSummary(summary, options));

  if (options.write) {
    // Only a full run may touch the committed baseline. A structure-only run has no
    // model numbers in it, and writing it over baseline.json would quietly delete the
    // half of the baseline that costs money to produce.
    const dir = options.structureOnly ? path.join(EVALS_DIR, "out") : BASELINE_DIR;
    const stem = options.structureOnly ? "structure-only" : "baseline";
    mkdirSync(dir, { recursive: true });
    const jsonPath = path.join(dir, `${stem}.json`);
    const mdPath = path.join(dir, `${stem}.md`);
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    writeFileSync(mdPath, renderMarkdown(report), "utf8");
    console.log(
      `\nWrote ${path.relative(process.cwd(), jsonPath)} and ${path.relative(process.cwd(), mdPath)}`
    );
    if (!options.structureOnly) console.log("Read the change with: git diff evals/baseline/");
  }
}

const statusGlyph = (row) => {
  if (row.parse_error || row.json_problems) return "FAIL";
  if (row.structure?.status === "drift") return "DRIFT";
  if (row.parse_skipped) return "----";
  return "ok";
};

const structureSummary = (row) => {
  if (row.audit_error) return `audit error: ${row.audit_error}`;
  if (!row.audit) return "no pdf";
  const drift = row.structure?.status === "drift" ? ` (expected ${num(row.structure.expected_score)})` : "";
  return `ats ${num(row.audit.ats_score)}${drift}`;
};

const rowSummary = (row) => {
  if (row.parse_error) return `parse failed: ${row.parse_error.slice(0, 120)}`;
  if (row.json_problems) return `invalid ParsedResume: ${row.json_problems.join("; ")}`;
  const parts = [
    `skills F1 ${row.skills.f1.toFixed(2)}`,
    `seniority ${row.seniority.status}`,
    `yoe ±${num(row.years.abs_error)}`,
  ];
  if (row.audit) parts.push(structureSummary(row));
  return parts.join(" | ");
};

const renderSummary = (summary, options) => {
  const lines = [
    `Fixtures          ${summary.fixtures} (${summary.real} real, ${summary.examples} example)`,
  ];
  if (!options.structureOnly) {
    lines.push(
      `Valid JSON        ${summary.valid_json.ok}/${summary.valid_json.of}  ${pct(summary.valid_json.rate)}`,
      `Skills            P ${num(summary.skills.macro_precision)}  R ${num(summary.skills.macro_recall)}  F1 ${num(summary.skills.macro_f1)}  (macro over ${summary.skills.graded})`,
      `                  micro P ${num(summary.skills.micro_precision)}  micro R ${num(summary.skills.micro_recall)}`,
      `Seniority         ${summary.seniority.matched}/${summary.seniority.labelled}  ${pct(summary.seniority.exact_match_rate)} exact`,
      `Years of exp.     MAE ${num(summary.years_of_experience.mean_abs_error)}  median ${num(summary.years_of_experience.median_abs_error)}  max ${num(summary.years_of_experience.max_abs_error)}  within 1y ${pct(summary.years_of_experience.within_1_year_rate)}`
    );
    for (const field of CONTACT_FIELDS) {
      const entry = summary.contact[field];
      lines.push(
        `  ${field.padEnd(16)}${entry.matched}/${entry.labelled}  ${pct(entry.rate)}`
      );
    }
  }
  lines.push(
    `Structure         ${summary.structure.matched}/${summary.structure.labelled} pinned scores match, ${summary.structure.drifted} drifted`
  );
  return lines.join("\n");
};

const renderMarkdown = (report) => {
  const { summary } = report;
  const rows = report.fixtures
    .map((row) => {
      const cells = [
        row.id,
        row.example ? "example" : "real",
        row.input,
        row.parse_ok ? "yes" : "**no**",
        row.skills ? row.skills.precision.toFixed(2) : "—",
        row.skills ? row.skills.recall.toFixed(2) : "—",
        row.skills ? row.skills.f1.toFixed(2) : "—",
        row.seniority ? row.seniority.status : "—",
        row.years ? num(row.years.abs_error) : "—",
        row.audit ? num(row.audit.ats_score) : "—",
        row.structure?.status ?? "—",
      ];
      return `| ${cells.join(" | ")} |`;
    })
    .join("\n");

  const contactRows = CONTACT_FIELDS.map(
    (field) =>
      `| ${field} | ${summary.contact[field].matched}/${summary.contact[field].labelled} | ${pct(summary.contact[field].rate)} |`
  ).join("\n");

  const misses = report.fixtures
    .filter((row) => row.skills && (row.skills.missing.length || row.skills.extra.length))
    .map(
      (row) =>
        `- **${row.id}** — missed: ${row.skills.missing.join(", ") || "none"}; extra: ${
          row.skills.extra.join(", ") || "none"
        }`
    )
    .join("\n");

  return `# Regression check baseline

Generated ${report.generated_at}${report.git_commit ? ` at commit \`${report.git_commit}\`` : ""} by \`npm run check\` (mode: ${report.mode}).

Deterministic graders only — no LLM judge (idea.md §6). Parsed by
\`${report.pipeline.parsed_by}\`, over the model candidates
${report.pipeline.model_candidates.map((model) => `\`${model}\``).join(", ")}.
${report.pipeline.note}

Structural grader: \`${report.pipeline.structural_grader}\`, against the registry measured
${report.pipeline.registry_bench_run_at}.

How to read the skill columns: recall is what the model missed, precision counts everything
it returned that the label does not list. \`parseResume\` is asked for "professional" skills
as well as technical ones, while the labels cover named technologies and practices only
(evals/README.md), so some precision loss is structural rather than an error.

## Summary

| Metric | Value |
|---|---|
| Fixtures | ${summary.fixtures} (${summary.real} real, ${summary.examples} example) |
| Valid \`ParsedResume\` rate | ${report.mode === "structure-only" ? "not run (structure-only)" : `${summary.valid_json.ok}/${summary.valid_json.of} — ${pct(summary.valid_json.rate)}`} |
| Skills macro precision | ${num(summary.skills.macro_precision)} |
| Skills macro recall | ${num(summary.skills.macro_recall)} |
| Skills macro F1 | ${num(summary.skills.macro_f1)} |
| Skills micro precision / recall | ${num(summary.skills.micro_precision)} / ${num(summary.skills.micro_recall)} |
| Seniority exact match | ${summary.seniority.matched}/${summary.seniority.labelled} — ${pct(summary.seniority.exact_match_rate)} |
| Years of experience MAE | ${num(summary.years_of_experience.mean_abs_error)} (median ${num(summary.years_of_experience.median_abs_error)}, max ${num(summary.years_of_experience.max_abs_error)}) |
| Years within 1 year | ${pct(summary.years_of_experience.within_1_year_rate)} |
| Structural scores matching pin | ${summary.structure.matched}/${summary.structure.labelled} (${summary.structure.drifted} drifted) |

### Contact fields

| Field | Matched | Rate |
|---|---|---|
${contactRows}

## Per fixture

| Fixture | Kind | Input | Valid JSON | Skill P | Skill R | Skill F1 | Seniority | YoE error | ATS score | Structure |
|---|---|---|---|---|---|---|---|---|---|---|
${rows}

## Skill differences

${misses || "_No fixture missed or added a skill._"}
`;
};

await main();
