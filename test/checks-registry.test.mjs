import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildRegistry, REGISTRY_PATH, REGISTRY_JSON_PATH } from "../bench/build-registry.mjs";
import { CHECKS } from "../checks/checks.mjs";

const severity = JSON.parse(
  readFileSync(path.join(process.cwd(), "bench", "results", "severity.json"), "utf8")
);

/**
 * The registry is generated. These tests exist to stop a severity from ever being typed in
 * by hand: every number in the committed registry must still equal what the bench measured.
 */

test("committed registry matches what the generator produces", () => {
  const { yaml, json } = buildRegistry();
  assert.equal(readFileSync(REGISTRY_PATH, "utf8"), yaml, "registry.yaml is stale - run: npm run bench:registry");
  assert.equal(
    readFileSync(REGISTRY_JSON_PATH, "utf8"),
    `${JSON.stringify(json, null, 2)}\n`,
    "registry.json is stale - run: npm run bench:registry"
  );
});

test("every severity in the registry comes from a bench measurement", () => {
  const { json } = buildRegistry();
  const byFixture = new Map(severity.dimensions.map((entry) => [entry.fixture, entry]));

  for (const check of json.checks) {
    if (check.severity_points === null) {
      assert.ok(
        ["placeholder-untested", "not-bench-measurable"].includes(check.severity_status),
        `${check.id} has no severity but does not say why`
      );
      assert.equal(check.evidence_fixture, null);
      continue;
    }
    const measured = byFixture.get(check.evidence_fixture);
    assert.ok(measured, `${check.id} cites a fixture with no measurement`);
    assert.equal(check.severity_points, measured.mean_drop_points);
    assert.deepEqual(check.severity_by_parser, measured.drop_points);
  }
});

test("a check flagged by only one parser is marked low confidence", () => {
  const { json } = buildRegistry();
  for (const check of json.checks) {
    if (check.parsers_agreed.length === 1) {
      assert.equal(check.confidence, "single-parser", `${check.id} hides its single-parser evidence`);
    }
    if (check.parsers_agreed.length >= 2) {
      assert.equal(check.confidence, "both-parsers");
    }
  }
});

test("every check names a layer the pipeline knows how to run", () => {
  const layers = new Set(["drop", "deterministic", "llm", "untested"]);
  for (const check of CHECKS) {
    assert.ok(layers.has(check.layer), `${check.id} has unknown layer ${check.layer}`);
    assert.ok(check.assertion && check.assertion.length > 10, `${check.id} has no testable assertion`);
  }
});
