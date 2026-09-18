/**
 * Fixture discovery and label validation for the regression check set.
 *
 * A fixture is a directory under `evals/fixtures/`:
 *
 *   evals/fixtures/<id>/
 *     expected.json   required — the labels, hand-written from the resume itself
 *     resume.pdf      the PDF a real user would upload (enables the structural grader)
 *     resume.txt      the text a real user would paste
 *     NOTES.md        optional — where this resume came from, what it is testing
 *
 * At least one of `resume.pdf` / `resume.txt` must exist. Both may: `input` then says
 * which one the model is fed, and the PDF is still used for the structural grader, so one
 * fixture can cover the paste path and the layout checks at once.
 *
 * Nothing here calls a model. Validation is meant to fail loudly before any paid call is
 * made — a fixture with a typo in `seniority_level` should not cost money to discover.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SENIORITY_LEVELS } from "./graders.mjs";

export const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.join(EVALS_DIR, "fixtures");
export const BASELINE_DIR = path.join(EVALS_DIR, "baseline");

/** idea.md §6: "The right size: ~15–20 fixtures". Below this the set is a placeholder. */
export const TARGET_FIXTURE_COUNT = 15;

const LABEL_FIELDS = [
  "candidate_name",
  "email",
  "phone",
  "location",
  "skills",
  "years_of_experience",
  "seniority_level",
];

/**
 * Reads every fixture directory, in id order.
 *
 * Returns `{ fixtures, problems }` rather than throwing, so the runner can print every
 * broken fixture at once instead of one per run.
 */
export function loadFixtures({ filter = [] } = {}) {
  if (!existsSync(FIXTURES_DIR)) {
    return { fixtures: [], problems: [`${FIXTURES_DIR} does not exist`] };
  }

  const ids = readdirSync(FIXTURES_DIR)
    .filter((entry) => statSync(path.join(FIXTURES_DIR, entry)).isDirectory())
    .sort();

  const fixtures = [];
  const problems = [];

  for (const id of ids) {
    if (filter.length && !filter.some((needle) => id.includes(needle))) continue;

    const dir = path.join(FIXTURES_DIR, id);
    const expectedPath = path.join(dir, "expected.json");
    if (!existsSync(expectedPath)) {
      problems.push(`${id}: no expected.json`);
      continue;
    }

    let expected;
    try {
      expected = JSON.parse(readFileSync(expectedPath, "utf8"));
    } catch (error) {
      problems.push(`${id}: expected.json is not valid JSON (${error.message})`);
      continue;
    }

    const pdfPath = path.join(dir, "resume.pdf");
    const textPath = path.join(dir, "resume.txt");
    const hasPdf = existsSync(pdfPath);
    const hasText = existsSync(textPath);

    if (!hasPdf && !hasText) {
      problems.push(`${id}: neither resume.pdf nor resume.txt`);
      continue;
    }

    const input = expected.input ?? (hasPdf ? "pdf" : "text");
    if (input !== "pdf" && input !== "text") {
      problems.push(`${id}: input must be "pdf" or "text", got ${JSON.stringify(input)}`);
      continue;
    }
    if (input === "pdf" && !hasPdf) problems.push(`${id}: input is "pdf" but resume.pdf is missing`);
    if (input === "text" && !hasText) {
      problems.push(`${id}: input is "text" but resume.txt is missing`);
    }

    const labels = expected.labels ?? {};
    for (const field of LABEL_FIELDS) {
      if (labels[field] === undefined) problems.push(`${id}: labels.${field} is missing`);
    }
    if (labels.skills !== undefined && !Array.isArray(labels.skills)) {
      problems.push(`${id}: labels.skills must be an array`);
    }
    if (
      labels.years_of_experience !== undefined &&
      typeof labels.years_of_experience !== "number"
    ) {
      problems.push(`${id}: labels.years_of_experience must be a number`);
    }
    if (
      labels.seniority_level !== undefined &&
      !SENIORITY_LEVELS.includes(labels.seniority_level)
    ) {
      problems.push(
        `${id}: labels.seniority_level must be one of ${SENIORITY_LEVELS.join(", ")}`
      );
    }
    if (expected.structure && !hasPdf) {
      problems.push(`${id}: has structure expectations but no resume.pdf to measure`);
    }
    if (id.startsWith("example-") && expected.example !== true) {
      problems.push(`${id}: directory is named example-* but expected.json does not set "example": true`);
    }

    fixtures.push({
      id: expected.id ?? id,
      dir,
      example: expected.example === true,
      shape: expected.shape ?? "",
      provenance: expected.provenance ?? "",
      input,
      pdf_path: hasPdf ? pdfPath : null,
      text_path: hasText ? textPath : null,
      labels,
      structure: expected.structure ?? null,
    });
  }

  return { fixtures, problems };
}

/** The resume text of a fixture, or null when it has no `resume.txt`. */
export function fixtureText(fixture) {
  return fixture.text_path ? readFileSync(fixture.text_path, "utf8") : null;
}

/** The resume PDF bytes of a fixture, or null when it has no `resume.pdf`. */
export function fixturePdf(fixture) {
  return fixture.pdf_path ? readFileSync(fixture.pdf_path) : null;
}
