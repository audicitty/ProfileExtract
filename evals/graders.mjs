/**
 * Deterministic graders for the regression check set (idea.md §6).
 *
 * Everything here is a pure function of (label, model output). No model is called, no
 * file is read, no network is touched — so these can be unit tested in `npm test` while
 * the runner that feeds them stays out of it.
 *
 * idea.md §6 is explicit that `ParsedResume` is structured enough not to need an LLM
 * judge. That is the whole reason this file is arithmetic and string comparison.
 */

/* -------------------------------------------------------------------------- */
/* Skill names                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Variant spellings of the *same* skill, collapsed before matching.
 *
 * This table exists because "Node.js", "NodeJS" and "Node" are one skill written three
 * ways, and a grader that counts them as three different answers measures spelling, not
 * extraction. It is deliberately small and deliberately boring.
 *
 * It is NOT an escape hatch. Adding an entry so that a wrong answer starts counting as
 * right is label editing by another name — see the two rules in evals/README.md. An
 * alias is only legitimate when a human reading the resume would call the two strings
 * the same skill.
 */
export const SKILL_ALIASES = {
  js: "javascript",
  ts: "typescript",
  node: "node.js",
  nodejs: "node.js",
  "node js": "node.js",
  reactjs: "react",
  "react.js": "react",
  "react js": "react",
  nextjs: "next.js",
  "next js": "next.js",
  expressjs: "express",
  "express.js": "express",
  postgres: "postgresql",
  "postgre sql": "postgresql",
  psql: "postgresql",
  mongo: "mongodb",
  "amazon web services": "aws",
  "google cloud platform": "gcp",
  k8s: "kubernetes",
  "ci cd": "ci/cd",
  cicd: "ci/cd",
  "rest api": "rest",
  "rest apis": "rest",
  "restful api": "rest",
  "restful apis": "rest",
  "power bi": "powerbi",
  "ms excel": "excel",
  "microsoft excel": "excel",
  "spring boot": "springboot",
  "sql server": "mssql",
  "microsoft sql server": "mssql",
  golang: "go",
};

/**
 * One skill string reduced to a comparable key.
 *
 * Case, surrounding punctuation and internal whitespace runs are noise. A trailing
 * plural "s" is not stripped and an internal "." is not stripped: "Node.js" and "Nodes"
 * are not the same word, and the alias table above is where genuine equivalences get
 * declared instead of guessed at.
 */
export function canonicalSkill(raw) {
  const cleaned = String(raw ?? "")
    .toLowerCase()
    .replace(/[‘’“”]/g, "")
    .replace(/[(),;]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9+#./]+/, "")
    .replace(/[^a-z0-9+#]+$/, "")
    .trim();
  return SKILL_ALIASES[cleaned] ?? cleaned;
}

const canonicalSet = (values) => {
  const set = new Set();
  for (const value of values ?? []) {
    const key = canonicalSkill(value);
    if (key) set.add(key);
  }
  return set;
};

/**
 * Set precision / recall / F1 over skill names.
 *
 * The label is the truth: `missing` is what the model failed to find, `extra` is what it
 * returned that the label does not contain. Read `extra` with care — if the resume really
 * does mention it, the label is incomplete, and the fix belongs in the label only when
 * the resume text supports it (never because the model said so).
 */
export function skillSetScore(expectedSkills, actualSkills) {
  const expected = canonicalSet(expectedSkills);
  const actual = canonicalSet(actualSkills);

  const matched = [...expected].filter((skill) => actual.has(skill));
  const missing = [...expected].filter((skill) => !actual.has(skill));
  const extra = [...actual].filter((skill) => !expected.has(skill));

  const precision = actual.size === 0 ? 0 : matched.length / actual.size;
  const recall = expected.size === 0 ? 0 : matched.length / expected.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    expected_count: expected.size,
    actual_count: actual.size,
    matched_count: matched.length,
    precision: round(precision, 3),
    recall: round(recall, 3),
    f1: round(f1, 3),
    missing: missing.sort(),
    extra: extra.sort(),
  };
}

/* -------------------------------------------------------------------------- */
/* Seniority, years, contact fields                                            */
/* -------------------------------------------------------------------------- */

export const SENIORITY_LEVELS = [
  "Entry-level",
  "Mid-level",
  "Senior",
  "Lead / Manager",
  "Executive",
];

/** Exact match, as idea.md §6 asks. The enum has five values; a near miss is a miss. */
export function seniorityMatch(expected, actual) {
  return String(expected ?? "") === String(actual ?? "");
}

/** Absolute error in years. `null` when the fixture does not label years. */
export function yearsError(expected, actual) {
  if (typeof expected !== "number") return null;
  const value = typeof actual === "number" ? actual : Number.NaN;
  if (!Number.isFinite(value)) return null;
  return round(Math.abs(expected - value), 2);
}

const looseText = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const phoneKey = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const emailKey = (value) => String(value ?? "").trim().toLowerCase();

/**
 * The contact fields graded, and how each is compared — exact match, after removing the
 * part of the string that carries no information:
 *
 * - `email` — case only.
 * - `phone` — digits only, last 10 compared. The same person writes +91 98765 43210,
 *   +91-98765-43210, 098765 43210 and 9876543210 on the same day.
 * - `candidate_name` / `location` — case, punctuation and whitespace runs.
 *
 * A label may be a single string or an array of accepted strings. The array is for cases
 * where more than one rendering is genuinely correct ("Bengaluru" / "Bengaluru, India"),
 * and every accepted form has to be written down *before* seeing model output.
 */
export const CONTACT_FIELDS = ["candidate_name", "email", "phone", "location"];

export function contactFieldMatch(field, expected, actual) {
  if (expected === undefined || expected === null || expected === "") {
    return { status: "not_labelled", expected: null, actual: actual ?? null };
  }
  const accepted = Array.isArray(expected) ? expected : [expected];
  const compare = field === "phone" ? phoneKey : field === "email" ? emailKey : looseText;
  const actualKey = compare(actual);
  const hit = actualKey !== "" && accepted.some((value) => compare(value) === actualKey);
  return {
    status: hit ? "match" : "miss",
    expected: accepted.length === 1 ? accepted[0] : accepted,
    actual: actual ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Valid-JSON rate                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Does this object satisfy the `ParsedResume` contract?
 *
 * `parseResume` asks Gemini for schema-constrained JSON and then normalises it, so a
 * malformed response surfaces either as a thrown error (the runner counts that as
 * invalid) or as a shape that fails here. Both are the same regression: the prompt
 * stopped producing usable structured output.
 */
export function validateParsedResume(value) {
  const problems = [];
  const object = value && typeof value === "object" ? value : null;
  if (!object) return { valid: false, problems: ["not an object"] };

  const isStringArray = (field) =>
    Array.isArray(object[field]) && object[field].every((item) => typeof item === "string");

  if (typeof object.candidate_name !== "string") problems.push("candidate_name not a string");
  if (!isStringArray("target_roles")) problems.push("target_roles not a string[]");
  if (!isStringArray("extracted_skills")) problems.push("extracted_skills not a string[]");
  if (!isStringArray("suggested_search_keywords")) {
    problems.push("suggested_search_keywords not a string[]");
  }
  if (
    typeof object.years_of_experience !== "number" ||
    !Number.isFinite(object.years_of_experience)
  ) {
    problems.push("years_of_experience not a finite number");
  }
  if (!SENIORITY_LEVELS.includes(object.seniority_level)) {
    problems.push(
      `seniority_level not one of the five levels (got ${JSON.stringify(object.seniority_level)})`
    );
  }
  if (typeof object.summary !== "string") problems.push("summary not a string");
  for (const field of ["email", "phone", "location"]) {
    if (object[field] !== undefined && typeof object[field] !== "string") {
      problems.push(`${field} present but not a string`);
    }
  }

  return { valid: problems.length === 0, problems };
}

/* -------------------------------------------------------------------------- */
/* Structural grader (src/lib/resume-ats.ts, reused from Phase 3)              */
/* -------------------------------------------------------------------------- */

/**
 * Compares a `ResumeAudit` against pinned structural expectations.
 *
 * Unlike everything above, this side has no model in it: `auditResumeStructure` is pure
 * TypeScript over positioned text, so one PDF must produce one score forever. Drift here
 * is a change in `resume-ats.ts`, `pdf-structure.ts` or `checks/registry.json` — never
 * model variance. That is why the comparison is exact rather than a tolerance.
 */
export function structureMatch(expected, audit) {
  if (!expected) return { status: "not_labelled" };
  if (!audit) return { status: "no_audit" };

  const expectedFailed = [...(expected.failed_check_ids ?? [])].sort();
  const actualFailed = audit.findings
    .filter((finding) => finding.status === "fail")
    .map((finding) => finding.check_id)
    .sort();

  const scoreDrift =
    typeof expected.ats_score === "number" && typeof audit.ats_score === "number"
      ? round(audit.ats_score - expected.ats_score, 1)
      : null;

  const newlyFailing = actualFailed.filter((id) => !expectedFailed.includes(id));
  const noLongerFailing = expectedFailed.filter((id) => !actualFailed.includes(id));
  const matched = scoreDrift === 0 && newlyFailing.length === 0 && noLongerFailing.length === 0;

  return {
    status: matched ? "match" : "drift",
    expected_score: expected.ats_score ?? null,
    actual_score: audit.ats_score ?? null,
    score_drift: scoreDrift,
    newly_failing: newlyFailing,
    no_longer_failing: noLongerFailing,
  };
}

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Rolls per-fixture results into the numbers you compare between runs.
 *
 * Skill scores are macro-averaged: every fixture counts once, whatever its skill count,
 * because a fixture is a resume shape and the set covers shapes evenly. The micro figures
 * are reported alongside so one long skills list cannot hide behind the mean.
 */
export function aggregate(rows) {
  const parsed = rows.filter((row) => row.parse_ok);
  const graded = parsed.filter((row) => row.skills);

  const mean = (values) =>
    values.length === 0 ? null : round(values.reduce((a, b) => a + b, 0) / values.length, 3);

  const matchedTotal = graded.reduce((sum, row) => sum + row.skills.matched_count, 0);
  const expectedTotal = graded.reduce((sum, row) => sum + row.skills.expected_count, 0);
  const actualTotal = graded.reduce((sum, row) => sum + row.skills.actual_count, 0);

  const yearErrors = parsed
    .map((row) => row.years?.abs_error)
    .filter((value) => typeof value === "number");
  const sortedErrors = [...yearErrors].sort((a, b) => a - b);

  const seniorityRows = parsed.filter(
    (row) => row.seniority && row.seniority.status !== "not_labelled"
  );
  const seniorityHits = seniorityRows.filter((row) => row.seniority.status === "match").length;

  const contact = {};
  for (const field of CONTACT_FIELDS) {
    const labelled = parsed.filter(
      (row) => row.contact?.[field] && row.contact[field].status !== "not_labelled"
    );
    const hits = labelled.filter((row) => row.contact[field].status === "match");
    contact[field] = {
      labelled: labelled.length,
      matched: hits.length,
      rate: labelled.length === 0 ? null : round(hits.length / labelled.length, 3),
    };
  }

  const structureRows = rows.filter(
    (row) => row.structure && row.structure.status !== "not_labelled"
  );

  return {
    fixtures: rows.length,
    examples: rows.filter((row) => row.example).length,
    real: rows.filter((row) => !row.example).length,
    valid_json: {
      ok: parsed.length,
      of: rows.length,
      rate: rows.length === 0 ? null : round(parsed.length / rows.length, 3),
    },
    skills: {
      graded: graded.length,
      macro_precision: mean(graded.map((row) => row.skills.precision)),
      macro_recall: mean(graded.map((row) => row.skills.recall)),
      macro_f1: mean(graded.map((row) => row.skills.f1)),
      micro_precision: actualTotal === 0 ? null : round(matchedTotal / actualTotal, 3),
      micro_recall: expectedTotal === 0 ? null : round(matchedTotal / expectedTotal, 3),
    },
    seniority: {
      labelled: seniorityRows.length,
      matched: seniorityHits,
      exact_match_rate:
        seniorityRows.length === 0 ? null : round(seniorityHits / seniorityRows.length, 3),
    },
    years_of_experience: {
      labelled: yearErrors.length,
      mean_abs_error: mean(yearErrors),
      median_abs_error:
        sortedErrors.length === 0
          ? null
          : round(
              sortedErrors.length % 2
                ? sortedErrors[(sortedErrors.length - 1) / 2]
                : (sortedErrors[sortedErrors.length / 2 - 1] +
                    sortedErrors[sortedErrors.length / 2]) /
                    2,
              2
            ),
      max_abs_error: sortedErrors.length === 0 ? null : sortedErrors[sortedErrors.length - 1],
      within_1_year_rate:
        yearErrors.length === 0
          ? null
          : round(yearErrors.filter((value) => value <= 1).length / yearErrors.length, 3),
    },
    contact,
    structure: {
      labelled: structureRows.length,
      matched: structureRows.filter((row) => row.structure.status === "match").length,
      drifted: structureRows.filter((row) => row.structure.status === "drift").length,
      no_audit: structureRows.filter((row) => row.structure.status === "no_audit").length,
    },
  };
}

export function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
