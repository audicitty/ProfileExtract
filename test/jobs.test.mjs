import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLinkedInJobSearchUrl,
  scoreJobsWithResume,
  normalizeSkillTokens,
  skillTokensMatch,
  enrichJobsWithDescriptions,
  SKILL_WEIGHT,
  ROLE_WEIGHT,
  UNKNOWN_SKILL_RATIO,
} from "../src/lib/jobs.ts";
// Extensionless on purpose: src/lib/jobs.ts imports "./job-descriptions", and
// tsx treats "./job-descriptions" and "./job-descriptions.ts" as two separate
// module instances with two separate caches. Matching the specifier keeps these
// tests pointed at the same cache the pipeline actually uses.
import {
  fetchJobDescriptions,
  clearJobDescriptionCache,
  jobDescriptionCacheStats,
  parseJobPostingPage,
  parseSkillsFromText,
  stripHtmlToText,
  JOB_DESCRIPTION_CACHE_TTL_MS,
} from "../src/lib/job-descriptions";
import { generateJobsCsv } from "../src/lib/jobs-csv.ts";

/* -------------------------------------------------------------------------- */
/* Fixtures — every network call in this suite is mocked.                     */
/* -------------------------------------------------------------------------- */

const RESUME = {
  candidate_name: "Alex Morgan",
  target_roles: ["Full Stack Engineer"],
  extracted_skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
  years_of_experience: 5,
  seniority_level: "Senior",
  summary: "Senior dev",
  suggested_search_keywords: ["Full Stack Engineer"],
};

const POSTING_HTML = `
<section class="top-card-layout">
  <a href="https://www.linkedin.com/company/acme">Acme</a>
</section>
<div class="show-more-less-html__markup">
  <strong>What you will do<br><br></strong>
  <ul>
    <li>Build services with Node.js and TypeScript across the stack.</li>
    <li>Ship React interfaces backed by PostgreSQL and Redis.</li>
    <li>Own deployment on AWS with Docker &amp; Kubernetes.</li>
  </ul>
  <p>Experience with Kafka is a plus. TypeScript everywhere.</p>
</div>
<h3 class="description__job-criteria-subheader">Seniority level</h3>
<span class="description__job-criteria-text description__job-criteria-text--criteria">Mid-Senior level</span>
<h3 class="description__job-criteria-subheader">Employment type</h3>
<span class="description__job-criteria-text description__job-criteria-text--criteria">Full-time</span>
`;

/** Minimal stand-in for a fetch Response. */
function mockResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, text: async () => body };
}

/** Records every requested job id so tests can assert on cache behaviour. */
function mockFetcher(handler) {
  const calls = [];
  const fetchImpl = async (url) => {
    const id = String(url).split("/").pop();
    calls.push(id);
    return handler(id);
  };
  return { fetchImpl, calls };
}

const noSleep = async () => {};

/* -------------------------------------------------------------------------- */
/* Existing behaviour                                                         */
/* -------------------------------------------------------------------------- */

test("buildLinkedInJobSearchUrl correctly parses filters into LinkedIn query params", () => {
  const url = buildLinkedInJobSearchUrl({
    keywords: "Full Stack Engineer",
    location: "San Francisco, CA",
    workplace_type: "remote",
    date_posted: "past_24h",
    experience_level: "senior",
  });

  assert.ok(url.startsWith("https://www.linkedin.com/jobs/search/?"));
  assert.ok(url.includes("keywords=Full+Stack+Engineer"));
  assert.ok(url.includes("location=San+Francisco%2C+CA"));
  assert.ok(url.includes("f_WT=2")); // Remote
  assert.ok(url.includes("f_TPR=r86400")); // 24 hours
  assert.ok(url.includes("f_E=4")); // Senior
});

test("scoreJobsWithResume computes match scores and identifies strengths and gaps", () => {
  const sampleJobs = [
    {
      id: "job-1",
      title: "Senior Full Stack Engineer",
      company: "Stripe",
      location: "San Francisco, CA",
      workplace_type: "Remote",
      salary: "$160,000 - $195,000",
      posted_date: "2 hours ago",
      description: "Building scalable payment platforms",
      apply_url: "https://www.linkedin.com/jobs/view/123",
      skills_required: ["React", "TypeScript", "Node.js", "PostgreSQL", "Kafka"],
      skills_source: "posting",
    },
    {
      id: "job-2",
      title: "iOS Mobile Engineer",
      company: "Apple",
      location: "Cupertino, CA",
      workplace_type: "On-site",
      salary: "$150,000 - $180,000",
      posted_date: "1 day ago",
      description: "Building native iOS apps in Swift",
      apply_url: "https://www.linkedin.com/jobs/view/456",
      skills_required: ["Swift", "Objective-C", "iOS SDK"],
      skills_source: "posting",
    },
  ];

  const scored = scoreJobsWithResume(sampleJobs, RESUME);

  assert.equal(scored.length, 2);
  // Job 1 should be ranked higher due to matching React, TypeScript, Node.js, PostgreSQL
  assert.ok(scored[0].match_score > scored[1].match_score);
  assert.ok(scored[0].match_score >= 80);
  assert.ok(scored[0].missing_skills.includes("Kafka"));
  assert.ok(scored[0].match_reasons.length > 0);
});

/* -------------------------------------------------------------------------- */
/* Token-boundary matching (CLAUDE.md §7 item 7)                              */
/* -------------------------------------------------------------------------- */

test("skill matching respects token boundaries instead of substrings", () => {
  const java = normalizeSkillTokens("Java");
  const javascript = normalizeSkillTokens("JavaScript");
  const r = normalizeSkillTokens("R");
  const react = normalizeSkillTokens("React");

  // The two collisions called out in CLAUDE.md §7 item 7.
  assert.equal(skillTokensMatch(java, javascript), false, "Java must not match JavaScript");
  assert.equal(skillTokensMatch(r, react), false, "R must not match React");

  // Genuine equivalences still match.
  assert.equal(skillTokensMatch(react, normalizeSkillTokens("React.js")), true);
  assert.equal(skillTokensMatch(normalizeSkillTokens("Node.js"), normalizeSkillTokens("Node JS")), true);
  assert.equal(skillTokensMatch(normalizeSkillTokens("PostgreSQL"), normalizeSkillTokens("Postgres")), true);
  assert.equal(
    skillTokensMatch(normalizeSkillTokens("AWS Lambda"), normalizeSkillTokens("AWS")),
    true,
    "a multi-word skill still matches its head term"
  );

  // Meaningful punctuation survives normalisation.
  assert.equal(skillTokensMatch(normalizeSkillTokens("C"), normalizeSkillTokens("C++")), false);
  assert.equal(skillTokensMatch(normalizeSkillTokens("C#"), normalizeSkillTokens("C++")), false);
});

test("Java/JavaScript and R/React collisions do not inflate a real score", () => {
  const resume = { ...RESUME, extracted_skills: ["JavaScript", "React"], target_roles: ["Frontend Engineer"] };

  const [scored] = scoreJobsWithResume(
    [
      {
        id: "collision",
        title: "Backend Engineer",
        company: "Acme",
        location: "Pune",
        workplace_type: "On-site",
        posted_date: "Today",
        description: "",
        apply_url: "https://www.linkedin.com/jobs/view/1",
        skills_required: ["Java", "R"],
        skills_source: "posting",
      },
    ],
    resume
  );

  assert.deepEqual(scored.missing_skills, ["Java", "R"]);
  assert.equal(scored.match_score, 0, "no skill overlap and no title match means zero");
});

/* -------------------------------------------------------------------------- */
/* Score range (CLAUDE.md §7 item 7)                                          */
/* -------------------------------------------------------------------------- */

test("match scores use the full 0-100 range, not a floor of 62", () => {
  const jobs = [
    {
      id: "perfect",
      title: "Full Stack Engineer",
      company: "Acme",
      location: "Bangalore",
      workplace_type: "Remote",
      posted_date: "Today",
      description: "",
      apply_url: "https://www.linkedin.com/jobs/view/1",
      skills_required: ["React", "TypeScript", "Node.js", "PostgreSQL"],
      skills_source: "posting",
    },
    {
      id: "irrelevant",
      title: "Clinical Research Associate",
      company: "Acme Bio",
      location: "Pune",
      workplace_type: "On-site",
      posted_date: "Today",
      description: "",
      apply_url: "https://www.linkedin.com/jobs/view/2",
      skills_required: ["Pharmacology", "Clinical Trials", "GCP Compliance"],
      skills_source: "posting",
    },
    {
      id: "partial",
      title: "Backend Engineer",
      company: "Acme",
      location: "Noida",
      workplace_type: "Hybrid",
      posted_date: "Today",
      description: "",
      apply_url: "https://www.linkedin.com/jobs/view/3",
      skills_required: ["Node.js", "Kafka", "Go", "Kubernetes"],
      skills_source: "posting",
    },
  ];

  const scored = scoreJobsWithResume(jobs, RESUME);
  const byId = Object.fromEntries(scored.map((j) => [j.id, j]));

  assert.equal(byId.perfect.match_score, SKILL_WEIGHT + ROLE_WEIGHT, "full overlap plus role match is 100");
  assert.equal(byId.irrelevant.match_score, 0, "an unrelated job scores 0, not 62");
  assert.equal(byId.partial.match_score, Math.round(0.25 * SKILL_WEIGHT), "1 of 4 skills scores 20");

  assert.ok(
    scored.some((j) => j.match_score < 62),
    "at least one score falls below the old 62 floor"
  );
  assert.ok(scored.every((j) => j.match_score >= 0 && j.match_score <= 100));
});

test("jobs with no skills data get a low-confidence score, not a 0.7 default", () => {
  const jobs = [
    {
      id: "no-skills-role-match",
      title: "Full Stack Engineer",
      company: "Acme",
      location: "Bangalore",
      workplace_type: "Remote",
      posted_date: "Today",
      description: "",
      apply_url: "https://www.linkedin.com/jobs/view/1",
      skills_required: [],
      skills_source: "inferred",
    },
    {
      id: "no-skills-no-role",
      title: "Operations Associate",
      company: "Acme",
      location: "Pune",
      workplace_type: "On-site",
      posted_date: "Today",
      description: "",
      apply_url: "https://www.linkedin.com/jobs/view/2",
      skills_required: [],
      skills_source: "inferred",
    },
  ];

  const scored = scoreJobsWithResume(jobs, RESUME);
  const byId = Object.fromEntries(scored.map((j) => [j.id, j]));

  assert.equal(byId["no-skills-role-match"].match_confidence, "low");
  assert.equal(byId["no-skills-no-role"].match_confidence, "low");

  assert.equal(
    byId["no-skills-no-role"].match_score,
    Math.round(UNKNOWN_SKILL_RATIO * SKILL_WEIGHT),
    "unknown overlap uses the low prior, not 0.7"
  );
  assert.ok(
    byId["no-skills-role-match"].match_score < Math.round(0.7 * SKILL_WEIGHT),
    "an unscoreable job cannot outrank a genuinely matched one"
  );
  assert.ok(byId["no-skills-no-role"].match_reasons.some((r) => /no requirements data/i.test(r)));
});

test("confidence reflects where skills_required came from", () => {
  const base = {
    title: "Full Stack Engineer",
    company: "Acme",
    location: "Bangalore",
    workplace_type: "Remote",
    posted_date: "Today",
    description: "",
    apply_url: "https://www.linkedin.com/jobs/view/1",
    skills_required: ["React", "Kafka"],
  };

  const scored = scoreJobsWithResume(
    [
      { ...base, id: "real", skills_source: "posting" },
      { ...base, id: "guessed", skills_source: "inferred" },
    ],
    RESUME
  );
  const byId = Object.fromEntries(scored.map((j) => [j.id, j]));

  assert.equal(byId.real.match_confidence, "high");
  assert.equal(byId.guessed.match_confidence, "medium");
  // Same skills either way — confidence is the signal, the score is unchanged.
  assert.equal(byId.real.match_score, byId.guessed.match_score);
});

/* -------------------------------------------------------------------------- */
/* Description parsing                                                        */
/* -------------------------------------------------------------------------- */

test("stripHtmlToText produces plain text with no markup and decoded entities", () => {
  const text = stripHtmlToText("<p>Ship <strong>React</strong> &amp; Node.js</p><br><li>AWS</li>");

  assert.ok(!text.includes("<"), "no tags survive");
  assert.ok(!text.includes(">"), "no tags survive");
  assert.ok(text.includes("React & Node.js"));
  assert.ok(text.includes("AWS"));
});

test("parseJobPostingPage extracts text, real skills, and criteria", () => {
  const parsed = parseJobPostingPage("999", POSTING_HTML);

  assert.ok(parsed, "a well-formed posting parses");
  assert.equal(parsed.id, "999");
  assert.ok(!parsed.text.includes("<"), "description text is never HTML");
  assert.ok(parsed.text.includes("Node.js"));
  assert.equal(parsed.seniority, "Mid-Senior level");
  assert.equal(parsed.employment_type, "Full-time");

  for (const expected of ["TypeScript", "Node.js", "React", "PostgreSQL", "AWS"]) {
    assert.ok(parsed.skills.includes(expected), `expected ${expected} in parsed skills`);
  }
  // TypeScript appears twice in the fixture, so it ranks first.
  assert.equal(parsed.skills[0], "TypeScript");
});

test("parseSkillsFromText matches on token boundaries", () => {
  // Order is a prominence heuristic, so compare as a set.
  assert.deepEqual(parseSkillsFromText("Strong Java and Spring Boot experience").sort(), [
    "Java",
    "Spring Boot",
  ]);
  assert.ok(
    !parseSkillsFromText("Deep JavaScript expertise required").includes("Java"),
    "JavaScript in prose must not register as Java"
  );
  assert.ok(parseSkillsFromText("Experience in C++ and C#").includes("C++"));
  assert.ok(parseSkillsFromText("Experience in C++ and C#").includes("C#"));
});

test("parseJobPostingPage returns null when the description block is absent", () => {
  assert.equal(parseJobPostingPage("1", "<html><body>Sign in to continue</body></html>"), null);
});

/* -------------------------------------------------------------------------- */
/* Cache (idea.md §7.2)                                                       */
/* -------------------------------------------------------------------------- */

test("fetchJobDescriptions serves repeat job ids from cache", async () => {
  clearJobDescriptionCache();
  const { fetchImpl, calls } = mockFetcher(() => mockResponse(200, POSTING_HTML));

  const first = await fetchJobDescriptions(["100", "101"], { fetchImpl, sleep: noSleep });
  assert.equal(first.size, 2);
  assert.equal(calls.length, 2, "cold cache fetches both");
  assert.equal(jobDescriptionCacheStats().misses, 2);

  const second = await fetchJobDescriptions(["100", "101"], { fetchImpl, sleep: noSleep });
  assert.equal(second.size, 2);
  assert.equal(calls.length, 2, "warm cache issues no further requests");
  assert.equal(jobDescriptionCacheStats().hits, 2);

  const mixed = await fetchJobDescriptions(["100", "102"], { fetchImpl, sleep: noSleep });
  assert.equal(mixed.size, 2);
  assert.deepEqual(calls, ["100", "101", "102"], "only the uncached id is fetched");
});

test("cached descriptions expire after the TTL", async () => {
  clearJobDescriptionCache();
  const { fetchImpl, calls } = mockFetcher(() => mockResponse(200, POSTING_HTML));

  let clock = 1_000_000;
  const now = () => clock;

  await fetchJobDescriptions(["200"], { fetchImpl, sleep: noSleep, now });
  assert.equal(calls.length, 1);

  clock += JOB_DESCRIPTION_CACHE_TTL_MS - 1;
  await fetchJobDescriptions(["200"], { fetchImpl, sleep: noSleep, now });
  assert.equal(calls.length, 1, "still inside the TTL");

  clock += 2;
  await fetchJobDescriptions(["200"], { fetchImpl, sleep: noSleep, now });
  assert.equal(calls.length, 2, "past the TTL the entry is refetched");
});

test("fetchJobDescriptions retries once on 429 and gives up after that", async () => {
  clearJobDescriptionCache();
  let seen = 0;
  const { fetchImpl, calls } = mockFetcher((id) => {
    if (id === "300") {
      seen++;
      return mockResponse(seen === 1 ? 429 : 200, POSTING_HTML);
    }
    return mockResponse(429, "");
  });

  const result = await fetchJobDescriptions(["300", "301"], { fetchImpl, sleep: noSleep, concurrency: 1 });

  assert.ok(result.has("300"), "the retried job succeeds");
  assert.ok(!result.has("301"), "a persistently limited job is simply omitted");
  assert.equal(calls.filter((c) => c === "300").length, 2);
  assert.equal(calls.filter((c) => c === "301").length, 2, "one retry only");
});

test("fetchJobDescriptions stops issuing requests once the time budget is spent", async () => {
  clearJobDescriptionCache();
  let clock = 0;
  const { fetchImpl, calls } = mockFetcher(() => {
    clock += 500; // each request burns half a second of the budget
    return mockResponse(200, POSTING_HTML);
  });

  const result = await fetchJobDescriptions(["400", "401", "402", "403", "404"], {
    fetchImpl,
    sleep: noSleep,
    now: () => clock,
    concurrency: 1,
    budgetMs: 1200,
  });

  assert.ok(calls.length < 5, "the budget cuts the pass short");
  assert.ok(result.size >= 1, "whatever landed inside the budget is kept");
});

/* -------------------------------------------------------------------------- */
/* Enrichment and per-job fallback                                            */
/* -------------------------------------------------------------------------- */

test("enrichJobsWithDescriptions uses real requirements and falls back per job", async () => {
  clearJobDescriptionCache();
  const { fetchImpl } = mockFetcher((id) =>
    id === "ok" ? mockResponse(200, POSTING_HTML) : mockResponse(500, "")
  );

  const jobs = [
    {
      id: "ok",
      title: "Full Stack Engineer",
      company: "Acme",
      location: "Bangalore",
      workplace_type: "Remote",
      posted_date: "Today",
      description: "Active job opening at Acme in Bangalore.",
      apply_url: "https://www.linkedin.com/jobs/view/ok",
      skills_required: ["React", "Node.js", "TypeScript", "PostgreSQL"],
      skills_source: "inferred",
    },
    {
      id: "broken",
      title: "Backend Engineer",
      company: "Globex",
      location: "Pune",
      workplace_type: "Hybrid",
      posted_date: "Today",
      description: "Active job opening at Globex in Pune.",
      apply_url: "https://www.linkedin.com/jobs/view/broken",
      skills_required: ["Node.js", "Python", "REST APIs", "Microservices"],
      skills_source: "inferred",
    },
  ];

  const enriched = await enrichJobsWithDescriptions(jobs, RESUME, { fetchImpl, sleep: noSleep });
  const byId = Object.fromEntries(enriched.map((j) => [j.id, j]));

  assert.equal(byId.ok.skills_source, "posting");
  assert.ok(byId.ok.description.includes("Node.js"));
  assert.ok(!byId.ok.description.startsWith("Active job opening"), "placeholder text is replaced");
  assert.ok(!byId.ok.description.includes("<"), "no HTML reaches the listing");
  assert.equal(byId.ok.experience_level, "Mid-Senior level");

  assert.equal(byId.broken.skills_source, "inferred", "a failed fetch falls back for that job alone");
  assert.deepEqual(byId.broken.skills_required, ["Node.js", "Python", "REST APIs", "Microservices"]);
  assert.ok(byId.broken.description.startsWith("Active job opening"));

  // The fallback is visible in the score's confidence, not hidden.
  const scored = scoreJobsWithResume(enriched, RESUME);
  const scoredById = Object.fromEntries(scored.map((j) => [j.id, j]));
  assert.equal(scoredById.ok.match_confidence, "high");
  assert.equal(scoredById.broken.match_confidence, "medium");
});

test("enrichJobsWithDescriptions never fabricates skills when every fetch fails", async () => {
  clearJobDescriptionCache();
  const { fetchImpl } = mockFetcher(() => mockResponse(503, ""));

  const jobs = [
    {
      id: "a",
      title: "Data Engineer",
      company: "Acme",
      location: "Chennai",
      workplace_type: "On-site",
      posted_date: "Today",
      description: "Active job opening at Acme in Chennai.",
      apply_url: "https://www.linkedin.com/jobs/view/a",
      skills_required: ["Python", "SQL", "Machine Learning"],
      skills_source: "inferred",
    },
  ];

  const enriched = await enrichJobsWithDescriptions(jobs, RESUME, { fetchImpl, sleep: noSleep });

  assert.deepEqual(enriched, jobs, "listings are returned untouched, not invented");
});

test("inferred skills never include the candidate's own skills", async () => {
  clearJobDescriptionCache();
  const { fetchImpl } = mockFetcher(() => mockResponse(500, ""));

  // A title with no keyword bucket falls through to the generic branch.
  const jobs = [
    {
      id: "generic",
      title: "Technical Program Manager",
      company: "Acme",
      location: "Mumbai",
      workplace_type: "On-site",
      posted_date: "Today",
      description: "Active job opening at Acme in Mumbai.",
      apply_url: "https://www.linkedin.com/jobs/view/generic",
      skills_required: ["JavaScript", "Software Engineering", "Git"],
      skills_source: "inferred",
    },
  ];

  const enriched = await enrichJobsWithDescriptions(jobs, RESUME, { fetchImpl, sleep: noSleep });

  for (const skill of ["TypeScript", "PostgreSQL", "Node.js", "React"]) {
    assert.ok(
      !enriched[0].skills_required.includes(skill),
      `${skill} is a candidate skill and must not be seeded into a job`
    );
  }
});

/* -------------------------------------------------------------------------- */
/* CSV                                                                        */
/* -------------------------------------------------------------------------- */

test("generateJobsCsv formats job rows with RFC 4180 escaping and headers", () => {
  const sampleJobs = [
    {
      id: "job-1",
      title: "Senior Full Stack Engineer",
      company: "Stripe, Inc.",
      location: "Remote, US",
      workplace_type: "Remote",
      salary: "$160,000 - $190,000",
      posted_date: "Just posted",
      description: 'Exciting role with "high impact" projects.',
      apply_url: "https://www.linkedin.com/jobs/view/123",
      skills_required: ["React", "TypeScript"],
      skills_source: "posting",
      match_score: 95,
      match_reasons: ["Matches React, TypeScript"],
      missing_skills: ["AWS"],
    },
  ];

  const csv = generateJobsCsv(sampleJobs);
  assert.match(csv, /"Job Title","Company","Match Score","Workplace Type","Location","Salary","Posted Date","Direct Apply Link"/);
  assert.match(csv, /"Senior Full Stack Engineer","Stripe, Inc.","95%","Remote","Remote, US"/);
  assert.match(csv, /""high impact""/);
});
