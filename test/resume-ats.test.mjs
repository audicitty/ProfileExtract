import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  ATS_CHECKS,
  ATS_REGISTRY,
  DETERMINISTIC_CHECK_IDS,
  assembleAtsScore,
  auditResumeStructure,
  buildPageLines,
  bulletMarkerOf,
  classifyDateToken,
  findDateRanges,
  isStandardHeading,
  registryCheck,
  renderLinesAsText,
  runAtsChecks,
  severityLabel,
  severityPointsFor,
} from "../src/lib/resume-ats.ts";
import { extractResumeDocument } from "../src/lib/pdf-structure.ts";

/* -------------------------------------------------------------------------- */
/* Synthetic documents                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Builds a ResumeDocument from page specs, so each check can be exercised without a PDF.
 * The Phase 2 fixture PDFs cover the same ground end to end further down, but they are
 * generated artefacts (bench/out is gitignored), so the unit coverage here does not
 * depend on them existing.
 */
const makeDoc = (pages) => {
  let flow = 0;
  const pdfPages = pages.map((entries, index) => {
    const items = entries.map((entry) => {
      const size = entry.size ?? 10.5;
      return {
        page: index + 1,
        flow_index: flow++,
        text: entry.text,
        x: entry.x,
        y: entry.y,
        width: entry.text.length * size * 0.5,
        height: size,
        font_size: size,
        font_name: "test",
      };
    });
    return {
      number: index + 1,
      width: 595,
      height: 842,
      x_origin: 0,
      y_origin: 0,
      items,
    };
  });
  const items = pdfPages.flatMap((page) => page.items);
  return {
    page_count: pdfPages.length,
    pages: pdfPages,
    items,
    text: pdfPages.map((page) => renderLinesAsText(buildPageLines(page))).join("\n\n"),
  };
};

const CONTACT = "aarav.mehta@example.com | +91 988 765 4321 | linkedin.com/in/aaravmehta";

/** One clean single-column page. Every variant below changes exactly one thing. */
const baselinePage = (overrides = {}) => {
  const {
    headings = ["Summary", "Experience", "Education", "Skills"],
    contactY = 764,
    contactX = 40,
    contactText = CONTACT,
    bullet = "•",
    dates = ["03/2022 - Present", "08/2014 - 05/2018"],
  } = overrides;
  return [
    { y: 784, x: 40, text: "Aarav Mehta", size: 19 },
    { y: contactY, x: contactX, text: contactText },
    { y: 741, x: 40, text: headings[0], size: 11.5 },
    { y: 723, x: 40, text: "Backend engineer with six years building payment services." },
    { y: 700, x: 40, text: headings[1], size: 11.5 },
    { y: 686, x: 40, text: "Senior Backend Engineer" },
    { y: 672, x: 40, text: dates[0] },
    { y: 658, x: 46, text: `${bullet} Rebuilt the settlement pipeline in Node.js.` },
    { y: 644, x: 46, text: `${bullet} Designed idempotent refund APIs.` },
    { y: 620, x: 40, text: headings[2], size: 11.5 },
    { y: 606, x: 40, text: dates[1] },
    { y: 592, x: 40, text: headings[3], size: 11.5 },
    { y: 578, x: 40, text: "JavaScript, TypeScript, Node.js, PostgreSQL" },
  ];
};

const baselineDoc = () => makeDoc([baselinePage()]);

const findingFor = (doc, id) => {
  const found = runAtsChecks(doc).find((entry) => entry.check_id === id);
  assert.ok(found, `no finding for ${id}`);
  return found;
};

const failedIds = (doc) =>
  runAtsChecks(doc)
    .filter((found) => found.status === "fail")
    .map((found) => found.check_id)
    .sort();

const ID = {
  headings: "structure.standard_section_headings",
  contactMargin: "contact.in_body_not_page_margin",
  onePage: "structure.length_one_page",
  singleColumn: "layout.single_column_reading_order",
  sidebar: "layout.sidebar_reading_order",
  tables: "structure.no_tables",
  bullets: "structure.glyph_bullets",
  dateConsistency: "dates.consistent_format",
  dateNumeric: "dates.numeric_month_format",
  dateInline: "dates.inline_not_right_aligned",
  contactIcons: "contact.no_icon_glyphs",
};

/* -------------------------------------------------------------------------- */
/* The registry is the only source of weights                                  */
/* -------------------------------------------------------------------------- */

test("every deterministic registry check has an implementation", () => {
  const implemented = ATS_CHECKS.map((check) => check.id).sort();
  assert.deepEqual(implemented, [...DETERMINISTIC_CHECK_IDS].sort());
});

test("nothing outside the deterministic layer is implemented", () => {
  for (const check of ATS_CHECKS) {
    assert.equal(
      registryCheck(check.id).layer,
      "deterministic",
      `${check.id} is not a deterministic check`
    );
  }
});

test("a check with no measured severity cannot be scored", () => {
  const unmeasured = ATS_REGISTRY.checks.find((check) => check.severity_points === null);
  assert.ok(unmeasured, "registry has no unmeasured check to test against");
  assert.throws(() => severityPointsFor(unmeasured.id), /no measured severity/);
});

test("deductions equal the registry's measured severities, not constants in the code", () => {
  const registrySeverity = (id) =>
    ATS_REGISTRY.checks.find((check) => check.id === id).severity_points;

  for (const check of ATS_CHECKS) {
    const found = findingFor(baselineDoc(), check.id);
    assert.equal(found.severity_points, registrySeverity(check.id));
  }

  const creative = makeDoc([
    baselinePage({
      headings: ["In A Nutshell", "Where I Made Impact", "How I Learned", "What I Work With"],
    }),
  ]);
  const audit = auditResumeStructure(creative);
  const expected = 100 - registrySeverity(ID.headings);
  assert.equal(audit.ats_score, Math.round(expected * 10) / 10);
});

test("severity labels come off the registry's own flag threshold", () => {
  const threshold = ATS_REGISTRY.flag_threshold_points;
  assert.equal(severityLabel(threshold * 4), "critical");
  assert.equal(severityLabel(threshold), "warning");
  assert.equal(severityLabel(threshold - 0.1), "minor");
  assert.equal(severityLabel(0), "minor");
});

test("every check reports a structured finding, never a bare boolean", () => {
  for (const found of runAtsChecks(baselineDoc())) {
    assert.ok(["pass", "fail", "not_applicable"].includes(found.status));
    assert.equal(typeof found.detail, "string");
    assert.ok(found.detail.length > 10, `${found.check_id} has no explanation`);
    assert.equal(typeof found.severity_points, "number");
    assert.ok(Array.isArray(found.evidence));
    assert.equal(typeof found.measurements, "object");
    assert.equal(found.statement, registryCheck(found.check_id).statement);
  }
});

test("an unsettled check carries its registry caveat into the finding", () => {
  const found = findingFor(baselineDoc(), ID.singleColumn);
  assert.equal(found.caveat, registryCheck(ID.singleColumn).caveat);
  assert.match(found.caveat, /NOT SETTLED/);
});

/* -------------------------------------------------------------------------- */
/* One test per implemented check                                              */
/* -------------------------------------------------------------------------- */

test("a clean single-column resume fails nothing and scores 100", () => {
  const audit = auditResumeStructure(baselineDoc());
  assert.deepEqual(failedIds(baselineDoc()), []);
  assert.equal(audit.ats_score, 100);
  assert.equal(audit.status, "scored");
  assert.deepEqual(audit.issues, []);
});

test("structure.standard_section_headings flags creative headings", () => {
  const doc = makeDoc([
    baselinePage({
      headings: ["In A Nutshell", "Where I Made Impact", "How I Learned", "What I Work With"],
    }),
  ]);
  const found = findingFor(doc, ID.headings);
  assert.equal(found.status, "fail");
  assert.equal(found.measurements.non_standard, 4);
  assert.ok(found.evidence.some((line) => line.includes("Where I Made Impact")));

  assert.equal(findingFor(baselineDoc(), ID.headings).status, "pass");
});

test("structure.standard_section_headings accepts conventional variants", () => {
  assert.ok(isStandardHeading("Professional Experience"));
  assert.ok(isStandardHeading("TECHNICAL SKILLS"));
  assert.ok(isStandardHeading("Education & Training"));
  assert.ok(!isStandardHeading("What I Work With"));
  assert.ok(!isStandardHeading("Things I Built"));
});

test("contact.in_body_not_page_margin flags a contact line in the page header", () => {
  const doc = makeDoc([baselinePage({ contactY: 822, contactX: 109 })]);
  const found = findingFor(doc, ID.contactMargin);
  assert.equal(found.status, "fail");
  assert.equal(found.measurements.in_margin, 1);

  // The body's own first line is near the top of the page too, and must not be flagged.
  assert.equal(findingFor(baselineDoc(), ID.contactMargin).status, "pass");
});

test("contact.in_body_not_page_margin is not applicable without contact details", () => {
  const doc = makeDoc([baselinePage({ contactText: "Bengaluru, Karnataka" })]);
  const found = findingFor(doc, ID.contactMargin);
  assert.equal(found.status, "not_applicable");
});

test("structure.length_one_page flags a second page and names the break", () => {
  const second = [
    { y: 792, x: 40, text: "Software Engineer" },
    { y: 778, x: 40, text: "Coral Labs" },
    { y: 764, x: 40, text: "06/2018 - 06/2019" },
  ];
  const doc = makeDoc([baselinePage(), second]);
  const found = findingFor(doc, ID.onePage);
  assert.equal(found.status, "fail");
  assert.equal(found.measurements.pages, 2);
  assert.ok(found.evidence[1].includes("Software Engineer"));

  assert.equal(findingFor(baselineDoc(), ID.onePage).status, "pass");
});

test("layout.single_column_reading_order flags two full columns", () => {
  const left = [];
  const right = [];
  for (let i = 0; i < 8; i++) {
    left.push({ y: 740 - i * 20, x: 40, text: `Left column text, line ${i} of the flow` });
    // Offset so the columns share few rows: each carries content of its own.
    right.push({
      y: 733 - i * 20,
      x: 320,
      text: `Right column text of the same width, line ${i}`,
    });
  }
  const doc = makeDoc([
    [
      { y: 784, x: 40, text: "Aarav Mehta", size: 19 },
      { y: 764, x: 40, text: CONTACT },
      ...left,
      ...right,
    ],
  ]);
  const found = findingFor(doc, ID.singleColumn);
  assert.equal(found.status, "fail");
  assert.equal(found.measurements.two_column_pages, 1);
  // A sidebar is the other check's business.
  assert.equal(findingFor(doc, ID.sidebar).status, "pass");

  assert.equal(findingFor(baselineDoc(), ID.singleColumn).status, "pass");
});

test("layout.sidebar_reading_order flags a narrow block beside the main column", () => {
  const main = [];
  for (let i = 0; i < 12; i++) {
    main.push({ y: 740 - i * 20, x: 210, text: `Main column line number ${i} of the body` });
  }
  const sidebar = [
    { y: 740, x: 40, text: "Skills", size: 11.5 },
    { y: 720, x: 40, text: "JavaScript," },
    { y: 707, x: 40, text: "TypeScript," },
    { y: 693, x: 40, text: "PostgreSQL," },
    { y: 680, x: 40, text: "Kubernetes" },
  ];
  const doc = makeDoc([
    [
      { y: 784, x: 40, text: "Aarav Mehta", size: 19 },
      { y: 764, x: 40, text: CONTACT },
      ...sidebar,
      ...main,
    ],
  ]);
  const found = findingFor(doc, ID.sidebar);
  assert.equal(found.status, "fail");
  assert.equal(found.measurements.sidebar_pages, 1);
  assert.equal(findingFor(doc, ID.singleColumn).status, "pass");

  assert.equal(findingFor(baselineDoc(), ID.sidebar).status, "pass");
});

test("structure.no_tables flags a repeating aligned grid", () => {
  const page = baselinePage();
  page.push(
    { y: 560, x: 40, text: "JavaScript" },
    { y: 560, x: 184, text: "TypeScript" },
    { y: 560, x: 318, text: "Node.js" },
    { y: 546, x: 40, text: "PostgreSQL" },
    { y: 546, x: 184, text: "Redis" },
    { y: 546, x: 318, text: "Docker" },
    { y: 532, x: 40, text: "AWS" },
    { y: 532, x: 184, text: "GraphQL" },
    { y: 532, x: 318, text: "Kafka" }
  );
  const found = findingFor(makeDoc([page]), ID.tables);
  assert.equal(found.status, "fail");
  assert.ok(found.measurements.grid_rows >= 2);

  assert.equal(findingFor(baselineDoc(), ID.tables).status, "pass");
});

test("structure.glyph_bullets flags hyphen bullets", () => {
  const doc = makeDoc([baselinePage({ bullet: "-" })]);
  const found = findingFor(doc, ID.bullets);
  assert.equal(found.status, "fail");
  assert.equal(found.measurements.marker, "-");
  assert.equal(found.measurements.non_glyph, 2);

  assert.equal(findingFor(baselineDoc(), ID.bullets).status, "pass");
});

test("bullet detection ignores a hyphen that opens prose", () => {
  assert.equal(bulletMarkerOf("• Rebuilt the pipeline"), "•");
  assert.equal(bulletMarkerOf("- Rebuilt the pipeline"), "-");
  assert.equal(bulletMarkerOf("-15 percent churn"), null);
  assert.equal(bulletMarkerOf("Rebuilt the pipeline"), null);
});

test("dates.consistent_format flags mixed formats", () => {
  const doc = makeDoc([
    baselinePage({ dates: ["03/2022 - Present", "Jul 2019 - Feb 2022"] }),
  ]);
  const found = findingFor(doc, ID.dateConsistency);
  assert.equal(found.status, "fail");
  assert.equal(found.measurements.formats, 2);

  assert.equal(findingFor(baselineDoc(), ID.dateConsistency).status, "pass");
});

test("dates.numeric_month_format flags spelled-out months", () => {
  const doc = makeDoc([
    baselinePage({ dates: ["March 2022 - Present", "August 2014 - May 2018"] }),
  ]);
  const consistency = findingFor(doc, ID.dateConsistency);
  const numeric = findingFor(doc, ID.dateNumeric);
  assert.equal(consistency.status, "pass", "one month-name format is still one format");
  assert.equal(numeric.status, "fail");
  assert.equal(numeric.measurements.month_name_ranges, 2);

  assert.equal(findingFor(baselineDoc(), ID.dateNumeric).status, "pass");
});

test("date parsing does not mistake other numbers for dates", () => {
  assert.deepEqual(findDateRanges("dropping regressions from 9 to 2 per quarter"), []);
  assert.deepEqual(findDateRanges("saving 4200 dollars per month"), []);
  assert.equal(classifyDateToken("03/2022"), "MM/YYYY");
  assert.equal(classifyDateToken("Jul 2019"), "Month YYYY");
  assert.equal(classifyDateToken("2018"), "YYYY");
  assert.equal(classifyDateToken("Present"), null);
  assert.deepEqual(
    findDateRanges("08/2014 - 05/2018 | GPA: 8.4/10").map((range) => range.text),
    ["08/2014 - 05/2018"]
  );
});

test("dates.inline_not_right_aligned flags a date pushed to the far margin", () => {
  const page = baselinePage();
  page.push({ y: 686, x: 470, text: "03/2022 - Present" });
  const found = findingFor(makeDoc([page]), ID.dateInline);
  assert.equal(found.status, "fail");
  assert.equal(found.measurements.detached_dates, 1);
  assert.ok(found.evidence[0].includes("Senior Backend Engineer"));

  assert.equal(findingFor(baselineDoc(), ID.dateInline).status, "pass");
});

test("contact.no_icon_glyphs flags icon glyphs on the contact line", () => {
  const doc = makeDoc([
    baselinePage({
      contactText: "✉ aarav.mehta@example.com | ☎ +91 988 765 4321",
    }),
  ]);
  const found = findingFor(doc, ID.contactIcons);
  assert.equal(found.status, "fail");
  assert.equal(found.measurements.icon_glyphs, 2);

  // Bullet glyphs sit outside the symbol block and must not trip this.
  assert.equal(findingFor(baselineDoc(), ID.contactIcons).status, "pass");
});

/* -------------------------------------------------------------------------- */
/* Score assembly                                                              */
/* -------------------------------------------------------------------------- */

test("sub-scores are per registry category and null when nothing applied", () => {
  const audit = auditResumeStructure(baselineDoc());
  assert.deepEqual(Object.keys(audit.sub_scores).sort(), [
    "contact",
    "dates",
    "layout",
    "structure",
  ]);
  for (const value of Object.values(audit.sub_scores)) assert.equal(value, 100);

  const margin = auditResumeStructure(makeDoc([baselinePage({ contactY: 822, contactX: 109 })]));
  assert.equal(
    margin.sub_scores.contact,
    Math.round((100 - severityPointsFor(ID.contactMargin)) * 10) / 10
  );
  assert.equal(margin.sub_scores.structure, 100);
});

test("a failing check becomes an issue with a fix and its measured weight", () => {
  const audit = auditResumeStructure(
    makeDoc([baselinePage({ contactY: 822, contactX: 109 })])
  );
  assert.equal(audit.issues.length, 1);
  const [issue] = audit.issues;
  assert.equal(issue.check_id, ID.contactMargin);
  assert.equal(issue.severity_points, severityPointsFor(ID.contactMargin));
  assert.equal(issue.severity, severityLabel(issue.severity_points));
  assert.equal(issue.category, "contact");
  assert.ok(issue.fix.length > 10);
  assert.equal(issue.confidence, registryCheck(ID.contactMargin).confidence);
});

test("issues are ordered by measured severity", () => {
  const doc = makeDoc([
    baselinePage({
      headings: ["In A Nutshell", "Where I Made Impact", "How I Learned", "What I Work With"],
      contactY: 822,
      contactX: 109,
      bullet: "-",
    }),
  ]);
  const audit = auditResumeStructure(doc);
  const points = audit.issues.map((issue) => issue.severity_points);
  assert.deepEqual(points, [...points].sort((a, b) => b - a));
  assert.equal(audit.issues[0].check_id, ID.headings);
});

test("a PDF with no text layer is reported, not scored as perfect", () => {
  const audit = auditResumeStructure(makeDoc([[]]));
  assert.equal(audit.status, "no_text_layer");
  assert.equal(audit.ats_score, null);
  assert.deepEqual(audit.issues, []);
  assert.equal(audit.findings.length, ATS_CHECKS.length);
});

test("the score never leaves 0-100 even if every check fails", () => {
  const findings = runAtsChecks(baselineDoc()).map((found) => ({
    ...found,
    status: "fail",
    points_deducted: found.severity_points,
  }));
  const { ats_score } = assembleAtsScore(findings);
  assert.ok(ats_score >= 0 && ats_score <= 100);
});

/* -------------------------------------------------------------------------- */
/* Determinism                                                                 */
/* -------------------------------------------------------------------------- */

test("the same resume produces byte-identical audits across repeated runs", () => {
  const variants = [
    baselineDoc(),
    makeDoc([
      baselinePage({
        headings: ["In A Nutshell", "Where I Made Impact", "How I Learned", "What I Work With"],
        contactY: 822,
        bullet: "-",
        dates: ["03/2022 - Present", "Jul 2019 - Feb 2022"],
      }),
    ]),
    makeDoc([[]]),
  ];

  for (const doc of variants) {
    const first = JSON.stringify(auditResumeStructure(doc));
    for (let run = 0; run < 5; run++) {
      assert.equal(JSON.stringify(auditResumeStructure(doc)), first);
    }
    // Interleaving a different document must not change the answer either: no check may
    // carry state (a /g regex's lastIndex, a cache) between calls.
    auditResumeStructure(variants[1]);
    assert.equal(JSON.stringify(auditResumeStructure(doc)), first);
  }
});

/* -------------------------------------------------------------------------- */
/* The Phase 2 fixture PDFs                                                    */
/* -------------------------------------------------------------------------- */

const FIXTURE_DIR = path.join(process.cwd(), "bench", "out", "fixtures");

/**
 * Each fixture differs from the baseline on exactly one dimension, so each one must fail
 * exactly the check(s) that dimension is about — and the baseline must fail none.
 * Fixture PDFs are generated (bench/out is gitignored); without them these skip.
 */
const FIXTURE_EXPECTATIONS = {
  "01-baseline": [],
  "02-two-column": [ID.singleColumn],
  "04-tables": [ID.tables, ID.dateInline],
  "05-creative-headings": [ID.headings],
  "06-hyphen-bullets": [ID.bullets],
  "07-contact-in-margin": [ID.contactMargin],
  "08-dates-month-year": [ID.dateNumeric],
  "09-dates-mixed": [ID.dateConsistency, ID.dateNumeric],
  "10-icon-contact": [ID.contactIcons],
  "11-two-page": [ID.onePage],
  "12-right-aligned-dates": [ID.dateInline],
  "13-sidebar-skills": [ID.sidebar],
};

const auditFixture = async (id) => {
  const bytes = new Uint8Array(await readFile(path.join(FIXTURE_DIR, `${id}.pdf`)));
  return auditResumeStructure(await extractResumeDocument(bytes));
};

for (const [id, expected] of Object.entries(FIXTURE_EXPECTATIONS)) {
  test(`fixture ${id} fails exactly the checks its dimension is about`, async (t) => {
    if (!existsSync(path.join(FIXTURE_DIR, `${id}.pdf`))) {
      t.skip("bench fixtures not built - run: npm run bench:fixtures");
      return;
    }
    const audit = await auditFixture(id);
    const failed = audit.findings
      .filter((found) => found.status === "fail")
      .map((found) => found.check_id)
      .sort();
    assert.deepEqual(failed, [...expected].sort());

    const deducted = expected.reduce((sum, check) => sum + severityPointsFor(check), 0);
    assert.equal(audit.ats_score, Math.round((100 - deducted) * 10) / 10);
  });
}

test("fixture 03-scanned-image has no text layer, so it gets no score", async (t) => {
  if (!existsSync(path.join(FIXTURE_DIR, "03-scanned-image.pdf"))) {
    t.skip("bench fixtures not built - run: npm run bench:fixtures");
    return;
  }
  const audit = await auditFixture("03-scanned-image");
  assert.equal(audit.status, "no_text_layer");
  assert.equal(audit.ats_score, null);
});

test("a fixture PDF audits identically across repeated runs", async (t) => {
  if (!existsSync(path.join(FIXTURE_DIR, "05-creative-headings.pdf"))) {
    t.skip("bench fixtures not built - run: npm run bench:fixtures");
    return;
  }
  const first = JSON.stringify(await auditFixture("05-creative-headings"));
  for (let run = 0; run < 3; run++) {
    assert.equal(JSON.stringify(await auditFixture("05-creative-headings")), first);
  }
});
