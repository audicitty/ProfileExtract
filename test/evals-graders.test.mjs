/**
 * Unit tests for the regression check set's graders (evals/graders.mjs).
 *
 * These belong in `npm test` even though `npm run check` deliberately does not: the
 * graders are pure functions with no model and no cost, and a grader that quietly stops
 * counting a miss as a miss would make every baseline after it meaningless.
 *
 * The fixture *labels* are also validated here, for the same reason — a typo in
 * `seniority_level` should be caught by a free test run, not by a paid one.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTACT_FIELDS,
  SENIORITY_LEVELS,
  aggregate,
  canonicalSkill,
  contactFieldMatch,
  seniorityMatch,
  skillSetScore,
  structureMatch,
  validateParsedResume,
  yearsError,
} from "../evals/graders.mjs";
import { loadFixtures } from "../evals/fixtures.mjs";

/* -------------------------------------------------------------------------- */
/* Skill names                                                                 */
/* -------------------------------------------------------------------------- */

test("canonicalSkill collapses case, padding and declared aliases", () => {
  assert.equal(canonicalSkill("  React "), "react");
  assert.equal(canonicalSkill("ReactJS"), "react");
  assert.equal(canonicalSkill("Node.js"), "node.js");
  assert.equal(canonicalSkill("NodeJS"), "node.js");
  assert.equal(canonicalSkill("Postgres"), "postgresql");
  assert.equal(canonicalSkill("K8s"), "kubernetes");
  assert.equal(canonicalSkill("REST APIs"), "rest");
});

test("canonicalSkill does not merge skills that only look alike", () => {
  assert.notEqual(canonicalSkill("Java"), canonicalSkill("JavaScript"));
  assert.notEqual(canonicalSkill("React"), canonicalSkill("React Native"));
  assert.notEqual(canonicalSkill("Node.js"), canonicalSkill("Nodes"));
  assert.notEqual(canonicalSkill("SQL"), canonicalSkill("PostgreSQL"));
});

test("skillSetScore computes set precision, recall and F1 against the label", () => {
  const score = skillSetScore(["React", "TypeScript", "Node.js"], ["react", "TypeScript", "Docker"]);
  assert.equal(score.expected_count, 3);
  assert.equal(score.actual_count, 3);
  assert.equal(score.matched_count, 2);
  assert.equal(score.precision, 0.667);
  assert.equal(score.recall, 0.667);
  assert.equal(score.f1, 0.667);
  assert.deepEqual(score.missing, ["node.js"]);
  assert.deepEqual(score.extra, ["docker"]);
});

test("skillSetScore scores an empty model answer as zero, not as a divide by zero", () => {
  const score = skillSetScore(["React"], []);
  assert.equal(score.precision, 0);
  assert.equal(score.recall, 0);
  assert.equal(score.f1, 0);
  assert.deepEqual(score.missing, ["react"]);
});

/* -------------------------------------------------------------------------- */
/* Seniority, years, contact                                                   */
/* -------------------------------------------------------------------------- */

test("seniorityMatch is exact — a near miss is a miss", () => {
  assert.equal(seniorityMatch("Mid-level", "Mid-level"), true);
  assert.equal(seniorityMatch("Mid-level", "Senior"), false);
  assert.equal(seniorityMatch("Lead / Manager", "Lead/Manager"), false);
});

test("yearsError is an absolute error, and null when unlabelled or unusable", () => {
  assert.equal(yearsError(4.3, 4), 0.3);
  assert.equal(yearsError(4, 5.5), 1.5);
  assert.equal(yearsError(undefined, 3), null);
  assert.equal(yearsError(3, Number.NaN), null);
});

test("contactFieldMatch compares phones by their last ten digits", () => {
  assert.equal(contactFieldMatch("phone", "+91 98290 44317", "9829044317").status, "match");
  assert.equal(contactFieldMatch("phone", "+91 98290 44317", "+91-98290-44317").status, "match");
  assert.equal(contactFieldMatch("phone", "+91 98290 44317", "098290 44317").status, "match");
  assert.equal(contactFieldMatch("phone", "+91 98290 44317", "9829044318").status, "miss");
});

test("contactFieldMatch ignores case and punctuation for names and locations", () => {
  assert.equal(contactFieldMatch("candidate_name", "Riya Sharma", "riya  sharma").status, "match");
  assert.equal(contactFieldMatch("email", "a.b@example.com", "A.B@Example.com").status, "match");
  assert.equal(
    contactFieldMatch("location", ["Bengaluru", "Bengaluru, Karnataka"], "bengaluru, karnataka")
      .status,
    "match"
  );
  assert.equal(contactFieldMatch("location", ["Bengaluru"], "Mysuru").status, "miss");
});

test("contactFieldMatch reports an unlabelled field rather than scoring it", () => {
  assert.equal(contactFieldMatch("phone", undefined, "9829044317").status, "not_labelled");
  assert.equal(contactFieldMatch("email", "", "a@b.com").status, "not_labelled");
});

test("an empty model answer is a miss, never a match on an empty label", () => {
  assert.equal(contactFieldMatch("email", "a@b.com", "").status, "miss");
  assert.equal(contactFieldMatch("phone", "+91 98290 44317", undefined).status, "miss");
});

/* -------------------------------------------------------------------------- */
/* Valid-JSON rate                                                             */
/* -------------------------------------------------------------------------- */

const VALID_PARSED = {
  candidate_name: "Riya Sharma",
  email: "riya@example.com",
  target_roles: ["Frontend Developer"],
  extracted_skills: ["React"],
  years_of_experience: 1.2,
  seniority_level: "Entry-level",
  summary: "One line.",
  suggested_search_keywords: ["React Developer"],
};

test("validateParsedResume accepts the shape parseResume returns", () => {
  assert.deepEqual(validateParsedResume(VALID_PARSED), { valid: true, problems: [] });
});

test("validateParsedResume rejects a seniority outside the five levels", () => {
  const result = validateParsedResume({ ...VALID_PARSED, seniority_level: "Junior" });
  assert.equal(result.valid, false);
  assert.match(result.problems.join(" "), /seniority_level/);
});

test("validateParsedResume rejects a non-numeric years_of_experience and bad arrays", () => {
  assert.equal(validateParsedResume({ ...VALID_PARSED, years_of_experience: "3" }).valid, false);
  assert.equal(validateParsedResume({ ...VALID_PARSED, extracted_skills: "React" }).valid, false);
  assert.equal(validateParsedResume({ ...VALID_PARSED, extracted_skills: [1, 2] }).valid, false);
  assert.equal(validateParsedResume(null).valid, false);
});

/* -------------------------------------------------------------------------- */
/* Structural grader                                                           */
/* -------------------------------------------------------------------------- */

const auditWith = (score, failedIds) => ({
  ats_score: score,
  findings: [
    ...failedIds.map((id) => ({ check_id: id, status: "fail" })),
    { check_id: "structure.standard_section_headings", status: "pass" },
  ],
});

test("structureMatch is exact: same score and same failing checks", () => {
  const expected = { ats_score: 81.8, failed_check_ids: ["contact.in_body_not_page_margin"] };
  const result = structureMatch(expected, auditWith(81.8, ["contact.in_body_not_page_margin"]));
  assert.equal(result.status, "match");
  assert.equal(result.score_drift, 0);
});

test("structureMatch reports which checks changed when the audit drifts", () => {
  const expected = { ats_score: 100, failed_check_ids: [] };
  const result = structureMatch(expected, auditWith(81.8, ["contact.in_body_not_page_margin"]));
  assert.equal(result.status, "drift");
  assert.equal(result.score_drift, -18.2);
  assert.deepEqual(result.newly_failing, ["contact.in_body_not_page_margin"]);
  assert.deepEqual(result.no_longer_failing, []);
});

test("structureMatch distinguishes an unpinned fixture from a missing audit", () => {
  assert.equal(structureMatch(null, auditWith(100, [])).status, "not_labelled");
  assert.equal(structureMatch({ ats_score: 100, failed_check_ids: [] }, null).status, "no_audit");
});

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                 */
/* -------------------------------------------------------------------------- */

test("aggregate counts a failed parse against the valid-JSON rate and skips its fields", () => {
  const summary = aggregate([
    {
      id: "a",
      example: false,
      parse_ok: true,
      skills: skillSetScore(["React"], ["React"]),
      seniority: { status: "match" },
      years: { abs_error: 0.2 },
      contact: { candidate_name: { status: "match" }, email: { status: "miss" } },
      structure: { status: "match" },
    },
    { id: "b", example: false, parse_ok: false, parse_error: "timeout", structure: { status: "not_labelled" } },
  ]);

  assert.equal(summary.fixtures, 2);
  assert.equal(summary.valid_json.rate, 0.5);
  assert.equal(summary.skills.graded, 1);
  assert.equal(summary.skills.macro_f1, 1);
  assert.equal(summary.seniority.exact_match_rate, 1);
  assert.equal(summary.years_of_experience.mean_abs_error, 0.2);
  assert.equal(summary.contact.candidate_name.rate, 1);
  assert.equal(summary.contact.email.rate, 0);
  assert.equal(summary.contact.phone.labelled, 0);
  assert.equal(summary.structure.labelled, 1);
  assert.equal(summary.structure.matched, 1);
});

test("aggregate separates example fixtures from real ones", () => {
  const summary = aggregate([
    { id: "example-01", example: true, parse_ok: true },
    { id: "07-real", example: false, parse_ok: true },
  ]);
  assert.equal(summary.examples, 1);
  assert.equal(summary.real, 1);
});

/* -------------------------------------------------------------------------- */
/* The committed fixtures                                                      */
/* -------------------------------------------------------------------------- */

test("every committed fixture validates and labels only the five seniority levels", () => {
  const { fixtures, problems } = loadFixtures();
  assert.deepEqual(problems, []);
  assert.ok(fixtures.length > 0, "no fixtures found under evals/fixtures/");
  for (const fixture of fixtures) {
    assert.ok(
      SENIORITY_LEVELS.includes(fixture.labels.seniority_level),
      `${fixture.id}: bad seniority label`
    );
    assert.ok(Array.isArray(fixture.labels.skills), `${fixture.id}: skills must be an array`);
    for (const field of CONTACT_FIELDS) {
      assert.ok(fixture.labels[field] !== undefined, `${fixture.id}: ${field} label missing`);
    }
  }
});

test("the example fixtures are all marked as examples, so they cannot pass as coverage", () => {
  const { fixtures } = loadFixtures();
  for (const fixture of fixtures) {
    if (fixture.id.startsWith("example-")) {
      assert.equal(fixture.example, true, `${fixture.id} is not flagged as an example`);
      assert.match(fixture.provenance, /EXAMPLE/);
    }
  }
});
