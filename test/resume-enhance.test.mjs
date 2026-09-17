import test from "node:test";
import assert from "node:assert/strict";

import {
  ENHANCE_SYSTEM_INSTRUCTION,
  LLM_CHECK_IDS,
  MAX_BULLET_REWRITES,
  analyzeSections,
  computeKeywordGaps,
  toAtsSafeText,
} from "../src/lib/resume-enhance.ts";
import { ATS_REGISTRY } from "../src/lib/resume-ats.ts";

const RESUME = `Divyanshu Bansal
Full Stack Engineer

Summary
Full Stack Engineer with 3 years building web applications in TypeScript and React.

Professional Experience
Full Stack Developer | TechInnovate | Jan 2023 - Present
- Built customer-facing modules in Next.js, cutting load time by 35%.
- Maintained REST APIs in Node.js and PostgreSQL.

Technical Skills
TypeScript, JavaScript, React, Next.js, Node.js, PostgreSQL, Docker

Education
B.Tech in Computer Science | 2019 - 2023`;

/* -------------------------------------------------------------------------- */
/* The prompt budget — idea.md §1.1: a long prompt is the failure mode         */
/* -------------------------------------------------------------------------- */

test("the content prompt stays inside its word budget", () => {
  const words = ENHANCE_SYSTEM_INSTRUCTION.trim().split(/\s+/).length;
  assert.ok(
    words <= 450,
    `content prompt is ${words} words; idea.md §1.1 budgets roughly 400. Cut a rule, do not raise the ceiling.`
  );
});

test("the prompt names only registry llm checks, and all of them", () => {
  const inRegistry = ATS_REGISTRY.checks
    .filter((check) => check.layer === "llm")
    .map((check) => check.id);

  assert.deepEqual(LLM_CHECK_IDS, inRegistry);

  for (const id of inRegistry) {
    assert.ok(
      ENHANCE_SYSTEM_INSTRUCTION.includes(id),
      `${id} is an llm-layer registry check but the prompt never asks for it`
    );
  }

  // Structural work belongs to Phase 3 and must not be re-checked by the model.
  for (const check of ATS_REGISTRY.checks) {
    if (check.layer === "llm") continue;
    assert.ok(
      !ENHANCE_SYSTEM_INSTRUCTION.includes(check.id),
      `${check.id} is a ${check.layer} check; the content prompt must not mention it`
    );
  }
});

test("the prompt caps bullet rewrites at the constant the validator enforces", () => {
  assert.ok(ENHANCE_SYSTEM_INSTRUCTION.includes(`at most ${MAX_BULLET_REWRITES} bullets`));
});

/* -------------------------------------------------------------------------- */
/* Keyword gaps — deterministic, token-boundary (registry assertion)           */
/* -------------------------------------------------------------------------- */

test("keyword gaps list only skills the resume never mentions", () => {
  const jd = `We need strong Kubernetes and Golang experience, plus React and PostgreSQL.`;
  const gaps = computeKeywordGaps(jd, RESUME);

  assert.ok(gaps.includes("Kubernetes"));
  assert.ok(gaps.includes("Go"), "Golang in the JD, never in the resume");
  assert.ok(!gaps.includes("React"), "React is in the resume, so it is not a gap");
  assert.ok(!gaps.includes("PostgreSQL"), "PostgreSQL is in the resume, so it is not a gap");
});

test("gap matching respects token boundaries", () => {
  // "JavaScript" in the resume must not satisfy a JD asking for Java.
  const gaps = computeKeywordGaps("Java and Spring Boot required.", "Skills: JavaScript, React");
  assert.ok(gaps.includes("Java"));
});

test("no target job description means no gaps", () => {
  assert.deepEqual(computeKeywordGaps("", RESUME), []);
});

/* -------------------------------------------------------------------------- */
/* Section analysis                                                            */
/* -------------------------------------------------------------------------- */

test("section analysis reads the resume's own headings", () => {
  const sections = analyzeSections(RESUME);
  const present = Object.fromEntries(sections.map((s) => [s.section, s.present]));

  assert.equal(present.Summary, true);
  assert.equal(present.Experience, true);
  assert.equal(present.Education, true);
  assert.equal(present.Skills, true);
  assert.equal(present.Certifications, false);
});

test("section analysis is deterministic", () => {
  assert.deepEqual(analyzeSections(RESUME), analyzeSections(RESUME));
});

/* -------------------------------------------------------------------------- */
/* Plain-text ATS-safe version — re-flow only, never a rewrite                 */
/* -------------------------------------------------------------------------- */

test("ats-safe text normalises bullets and strips decorative glyphs", () => {
  const messy = "Experience\n•  Built ▸ things\n– Shipped   more things\n\n\n\nEducation";
  const safe = toAtsSafeText(messy);

  assert.equal(
    safe,
    "Experience\n- Built things\n- Shipped more things\n\nEducation"
  );
});

test("ats-safe text invents no words", () => {
  const safe = toAtsSafeText(RESUME);
  for (const word of ["TechInnovate", "PostgreSQL", "B.Tech"]) {
    assert.ok(safe.includes(word), `${word} was dropped from the ATS-safe version`);
  }
  assert.ok(!safe.includes("•"));
});

test("ats-safe text handles empty input", () => {
  assert.equal(toAtsSafeText(""), "");
});
