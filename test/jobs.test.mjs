import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLinkedInJobSearchUrl,
  scoreJobsWithResume,
  skillsAreEquivalent,
  canonicalizeSkill,
  stripHtmlToText,
  extractSkillsFromText,
  parseJobPostingHtml,
  fetchJobPostingDetail,
  enrichJobsWithDescriptions,
  clearPostingCache,
  getPostingCacheStats,
  DESCRIPTION_CACHE_TTL_MS,
  DESCRIPTION_FETCH_LIMIT,
} from "../src/lib/jobs.ts";
import { generateJobsCsv } from "../src/lib/jobs-csv.ts";

/* ------------------------------------------------------------------ *
 * Helpers — every network call in this suite is mocked. The suite must
 * never touch LinkedIn.
 * ------------------------------------------------------------------ */

const realFetch = globalThis.fetch;

/** Installs a fetch stub and returns the recorded call log. */
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return handler(String(url), init, calls.length);
  };
  return calls;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

function htmlResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

/** Minimal shape of a real per-job guest response. */
function postingHtml({ body, seniority = "Mid-Senior level", employment = "Full-time" }) {
  return `
    <section class="top-card-layout"></section>
    <div class="description__text description__text--rich">
      <section class="show-more-less-html" data-max-lines="5">
        <div class="show-more-less-html__markup show-more-less-html__markup--clamp-after-5
            relative overflow-hidden">${body}</div>
        <button class="show-more-less-html__button">Show more</button>
      </section>
    </div>
    <ul class="description__job-criteria-list">
      <li class="description__job-criteria-item">
        <h3 class="description__job-criteria-subheader">Seniority level</h3>
        <span class="description__job-criteria-text description__job-criteria-text--criteria">${seniority}</span>
      </li>
      <li class="description__job-criteria-item">
        <h3 class="description__job-criteria-subheader">Employment type</h3>
        <span class="description__job-criteria-text description__job-criteria-text--criteria">${employment}</span>
      </li>
    </ul>`;
}

function jobFixture(id, title, overrides = {}) {
  return {
    id,
    title,
    company: "Acme",
    location: "Bengaluru, Karnataka, India",
    workplace_type: "On-site",
    posted_date: "1 day ago",
    description: "",
    apply_url: `https://www.linkedin.com/jobs/view/${id}`,
    skills_required: ["React", "Node.js"],
    requirements_source: "inferred",
    ...overrides,
  };
}

const resume = {
  candidate_name: "Alex Morgan",
  target_roles: ["Full Stack Engineer"],
  extracted_skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
  years_of_experience: 5,
  seniority_level: "Senior",
  summary: "Senior dev",
  suggested_search_keywords: ["Full Stack Engineer"],
};

/* ------------------------------------------------------------------ *
 * Existing behaviour
 * ------------------------------------------------------------------ */

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
    },
  ];

  const scored = scoreJobsWithResume(sampleJobs, resume);

  assert.equal(scored.length, 2);
  // Job 1 should be ranked higher due to matching React, TypeScript, Node.js, PostgreSQL
  assert.ok(scored[0].match_score > scored[1].match_score);
  assert.ok(scored[0].match_score >= 80);
  assert.ok(scored[0].missing_skills.includes("Kafka"));
  assert.ok(scored[0].match_reasons.length > 0);
});

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

/* ------------------------------------------------------------------ *
 * Token-boundary skill matching (CLAUDE.md §7 item 7)
 * ------------------------------------------------------------------ */

test("skillsAreEquivalent rejects the Java/JavaScript and R/React substring collisions", () => {
  assert.equal(skillsAreEquivalent("Java", "JavaScript"), false);
  assert.equal(skillsAreEquivalent("JavaScript", "Java"), false);
  assert.equal(skillsAreEquivalent("R", "React"), false);
  assert.equal(skillsAreEquivalent("React", "R"), false);
  // and other classic containment traps
  assert.equal(skillsAreEquivalent("SQL", "PostgreSQL"), false);
  assert.equal(skillsAreEquivalent("Go", "MongoDB"), false);
  assert.equal(skillsAreEquivalent("C", "C++"), false);
  assert.equal(skillsAreEquivalent("Vue", "Vuex"), false);
});

test("skillsAreEquivalent still matches genuine aliases and case/punctuation variants", () => {
  assert.equal(skillsAreEquivalent("Node.js", "nodejs"), true);
  assert.equal(skillsAreEquivalent("node", "Node.js"), true);
  assert.equal(skillsAreEquivalent("react.js", "REACT"), true);
  assert.equal(skillsAreEquivalent("Golang", "Go"), true);
  assert.equal(skillsAreEquivalent("postgres", "PostgreSQL"), true);
  assert.equal(skillsAreEquivalent("K8s", "Kubernetes"), true);
  assert.equal(skillsAreEquivalent("c++", "CPP"), true);
  // Unknown-to-vocabulary terms still compare on token runs, not substrings.
  assert.equal(skillsAreEquivalent("Acme Widget Framework", "Widget Framework"), true);
  assert.equal(skillsAreEquivalent("Widgetry", "Widget"), false);
});

test("canonicalizeSkill folds aliases onto one canonical name", () => {
  assert.equal(canonicalizeSkill("ReactJS"), "React");
  assert.equal(canonicalizeSkill("react.js"), "React");
  assert.equal(canonicalizeSkill("JS"), "JavaScript");
  assert.equal(canonicalizeSkill("Java"), "Java");
  // Unknown terms normalize rather than resolve.
  assert.equal(canonicalizeSkill("Acme  Widget!"), "acme widget");
});

test("Java/JavaScript collision no longer inflates a real score", () => {
  const javaOnlyResume = { ...resume, extracted_skills: ["Java", "Spring Boot"], target_roles: ["Java Engineer"] };
  const [scored] = scoreJobsWithResume(
    [jobFixture("1", "Frontend Engineer", { skills_required: ["JavaScript", "React", "CSS"], requirements_source: "posting" })],
    javaOnlyResume
  );

  assert.deepEqual(scored.missing_skills, ["JavaScript", "React", "CSS"]);
  assert.equal(scored.match_score < 30, true, `expected a low score, got ${scored.match_score}`);
});

/* ------------------------------------------------------------------ *
 * Full score range (CLAUDE.md §7 item 7)
 * ------------------------------------------------------------------ */

test("match scores use the full 0-100 range instead of flooring at 62", () => {
  const jobs = [
    // Perfect: every stated requirement matched, title and seniority aligned.
    jobFixture("perfect", "Full Stack Engineer", {
      skills_required: ["React", "TypeScript", "Node.js", "PostgreSQL"],
      requirements_source: "posting",
      posting_seniority_level: "Mid-Senior level",
    }),
    // Total mismatch: nothing in common, unrelated title.
    jobFixture("mismatch", "Petroleum Drilling Supervisor", {
      skills_required: ["Drilling", "Petrophysics", "Well Logging"],
      requirements_source: "posting",
      posting_seniority_level: "Internship",
    }),
  ];

  const scored = scoreJobsWithResume(jobs, resume);
  const byId = Object.fromEntries(scored.map((j) => [j.id, j]));

  assert.equal(byId.perfect.match_score, 100);
  assert.equal(byId.mismatch.match_score, 0);
  // The old formula could produce nothing below 62.
  assert.ok(byId.mismatch.match_score < 62);
  for (const job of scored) {
    assert.ok(job.match_score >= 0 && job.match_score <= 100);
  }
});

test("partial skill overlap lands mid-range, not near the top", () => {
  const [scored] = scoreJobsWithResume(
    [
      jobFixture("partial", "Backend Engineer", {
        skills_required: ["Java", "Spring Boot", "Kafka", "Kubernetes", "React"],
        requirements_source: "posting",
        posting_seniority_level: "Mid-Senior level",
      }),
    ],
    resume
  );

  assert.ok(scored.match_score > 20 && scored.match_score < 70, `got ${scored.match_score}`);
  assert.equal(scored.match_confidence, "high");
});

/* ------------------------------------------------------------------ *
 * No-skills-data path (CLAUDE.md §7 item 7)
 * ------------------------------------------------------------------ */

test("a job with no skills data is low confidence and is not handed a 0.7 default ratio", () => {
  const [scored] = scoreJobsWithResume(
    [
      jobFixture("bare", "Full Stack Engineer", {
        skills_required: [],
        requirements_source: "posting",
      }),
    ],
    resume
  );

  assert.equal(scored.match_confidence, "low");
  assert.deepEqual(scored.missing_skills, []);
  // Title alignment is perfect, so the score reflects that alone, discounted
  // for missing evidence — it is computed, not defaulted: the old code produced
  // 62 + 0.7 * 33 = 85 here.
  assert.notEqual(scored.match_score, 85);
  assert.equal(scored.match_score, 50);
  assert.ok(
    scored.match_reasons.some((r) => r.includes("No requirements listed")),
    "expected the low-confidence reason to be surfaced"
  );
});

test("a low-confidence job scores below an otherwise identical job with matched requirements", () => {
  const scored = scoreJobsWithResume(
    [
      jobFixture("bare", "Full Stack Engineer", { skills_required: [], requirements_source: "posting" }),
      jobFixture("known", "Full Stack Engineer", {
        skills_required: ["React", "TypeScript", "Node.js"],
        requirements_source: "posting",
      }),
    ],
    resume
  );

  assert.equal(scored[0].id, "known");
  assert.equal(scored[0].match_confidence, "high");
  assert.equal(scored[1].match_confidence, "low");
});

test("inferred requirements are reported as medium confidence", () => {
  const [scored] = scoreJobsWithResume(
    [jobFixture("inf", "Full Stack Engineer", { skills_required: ["React", "Node.js"], requirements_source: "inferred" })],
    resume
  );

  assert.equal(scored.match_confidence, "medium");
  assert.ok(scored.match_reasons.some((r) => r.includes("inferred from the job title")));
});

/* ------------------------------------------------------------------ *
 * HTML stripping and skill extraction from real posting text
 * ------------------------------------------------------------------ */

test("stripHtmlToText removes markup, scripts and entities", () => {
  const text = stripHtmlToText(
    '<div><script>alert("x")</script><p>We need <strong>React</strong> &amp; Node.js</p><ul><li>5+ yrs</li></ul></div>'
  );

  assert.ok(!text.includes("<"));
  assert.ok(!text.includes("alert"));
  assert.ok(text.includes("React & Node.js"));
  assert.ok(text.includes("5+ yrs"));
});

test("extractSkillsFromText pulls real skills and ignores generic prose", () => {
  const skills = extractSkillsFromText(
    "You will build services in Java and Spring Boot, deploy on Kubernetes with Docker, " +
      "and query PostgreSQL. We go to production daily and invest in R&D. Kubernetes experience is a must."
  );

  assert.ok(skills.includes("Java"));
  assert.ok(skills.includes("Spring Boot"));
  assert.ok(skills.includes("Kubernetes"));
  assert.ok(skills.includes("Docker"));
  assert.ok(skills.includes("PostgreSQL"));
  // "go to production" must not become Golang; "R&D" must not become R.
  assert.ok(!skills.includes("Go"));
  assert.ok(!skills.includes("R"));
  // Repeated mentions rank first.
  assert.equal(skills[0], "Kubernetes");
});

test("extractSkillsFromText prefers the longest matching skill name", () => {
  const skills = extractSkillsFromText("Experience with Spring Boot and React Native required.");
  assert.ok(skills.includes("Spring Boot"));
  assert.ok(skills.includes("React Native"));
  assert.ok(!skills.includes("Spring"));
  assert.ok(!skills.includes("React"));
});

test("parseJobPostingHtml extracts plain-text body, skills and criteria", () => {
  const detail = parseJobPostingHtml(
    postingHtml({ body: "Build with <strong>React</strong>, TypeScript and AWS.<br>Docker a plus." })
  );

  assert.ok(detail);
  assert.ok(!detail.description.includes("<"));
  assert.ok(detail.description.includes("React"));
  assert.deepEqual(detail.skills.sort(), ["AWS", "Docker", "React", "TypeScript"]);
  assert.equal(detail.seniority, "Mid-Senior level");
  assert.equal(detail.employment_type, "Full-time");
});

test("parseJobPostingHtml returns null when there is no posting body", () => {
  assert.equal(parseJobPostingHtml("<html><body>Sign in to continue</body></html>"), null);
  assert.equal(parseJobPostingHtml(""), null);
});

/* ------------------------------------------------------------------ *
 * Cache hit / miss paths
 * ------------------------------------------------------------------ */

test("fetchJobPostingDetail misses once then serves the same job from cache", async (t) => {
  clearPostingCache();
  t.after(restoreFetch);

  const calls = mockFetch(() => htmlResponse(postingHtml({ body: "React and PostgreSQL." })));

  const first = await fetchJobPostingDetail("111");
  assert.ok(first);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /jobs-guest\/jobs\/api\/jobPosting\/111$/);
  assert.deepEqual(getPostingCacheStats(), { size: 1, hits: 0, misses: 1 });

  const second = await fetchJobPostingDetail("111");
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1, "a cache hit must not hit the network");
  assert.deepEqual(getPostingCacheStats(), { size: 1, hits: 1, misses: 1 });

  // A different job still goes out to the network.
  await fetchJobPostingDetail("222");
  assert.equal(calls.length, 2);
  assert.deepEqual(getPostingCacheStats(), { size: 2, hits: 1, misses: 2 });
});

test("cached postings expire after the TTL and are refetched", async (t) => {
  clearPostingCache();
  t.after(() => {
    restoreFetch();
    Date.now = realNow;
  });

  const calls = mockFetch(() => htmlResponse(postingHtml({ body: "React and Docker." })));
  const realNow = Date.now;
  let clock = 1_000_000;
  Date.now = () => clock;

  await fetchJobPostingDetail("333");
  assert.equal(calls.length, 1);

  clock += DESCRIPTION_CACHE_TTL_MS - 1000; // still inside the window
  await fetchJobPostingDetail("333");
  assert.equal(calls.length, 1);
  assert.equal(getPostingCacheStats().hits, 1);

  clock += 2000; // now past the TTL
  await fetchJobPostingDetail("333");
  assert.equal(calls.length, 2, "an expired entry must be refetched");
});

test("fetchJobPostingDetail never calls the network for a non-numeric job id", async (t) => {
  clearPostingCache();
  t.after(restoreFetch);
  const calls = mockFetch(() => htmlResponse(postingHtml({ body: "React." })));

  assert.equal(await fetchJobPostingDetail("ai-generated-job-3"), null);
  assert.equal(calls.length, 0);
});

test("DESCRIPTION_FETCH_LIMIT defaults to 25", () => {
  assert.equal(DESCRIPTION_FETCH_LIMIT, 25);
});

/* ------------------------------------------------------------------ *
 * Description-fetch enrichment and its fallback
 * ------------------------------------------------------------------ */

test("enrichJobsWithDescriptions replaces inferred skills with real posting requirements", async (t) => {
  clearPostingCache();
  t.after(restoreFetch);

  mockFetch(() =>
    htmlResponse(
      postingHtml({ body: "You will use Java, Spring Boot and Kafka on Kubernetes.", seniority: "Mid-Senior level" })
    )
  );

  const [enriched] = await enrichJobsWithDescriptions([jobFixture("900", "Full Stack Engineer")], resume);

  assert.equal(enriched.requirements_source, "posting");
  assert.deepEqual(enriched.skills_required.sort(), ["Java", "Kafka", "Kubernetes", "Spring Boot"]);
  assert.ok(enriched.description.includes("Spring Boot"));
  assert.ok(!enriched.description.includes("<"));
  assert.equal(enriched.posting_seniority_level, "Mid-Senior level");
  assert.equal(enriched.employment_type, "Full-time");
  // None of the candidate's own skills leaked into the requirements.
  assert.ok(!enriched.skills_required.includes("React"));
});

test("enrichJobsWithDescriptions falls back per job when a single fetch fails", async (t) => {
  clearPostingCache();
  t.after(restoreFetch);

  mockFetch((url) => {
    if (url.endsWith("/501")) return htmlResponse("Too many requests", 429);
    if (url.endsWith("/502")) throw new Error("socket hang up");
    return htmlResponse(postingHtml({ body: "Django, Python and PostgreSQL required." }));
  });

  const enriched = await enrichJobsWithDescriptions(
    [
      jobFixture("501", "Backend Engineer"),
      // No skills at all, so the fallback has to derive them from the title.
      jobFixture("502", "Backend Engineer", { skills_required: [] }),
      jobFixture("503", "Backend Engineer"),
    ],
    resume
  );

  const byId = Object.fromEntries(enriched.map((j) => [j.id, j]));

  // Blocked and errored jobs keep the title-inferred fallback, flagged as such.
  assert.equal(byId["501"].requirements_source, "inferred");
  assert.equal(byId["502"].requirements_source, "inferred");
  assert.deepEqual(byId["501"].skills_required, ["React", "Node.js"]);
  assert.deepEqual(byId["502"].skills_required, ["Node.js", "Python", "REST APIs", "Microservices"]);
  assert.equal(byId["501"].description, "", "a failed fetch must not fabricate a description");

  // The healthy one gets the real thing.
  assert.equal(byId["503"].requirements_source, "posting");
  assert.deepEqual(byId["503"].skills_required.sort(), ["Django", "PostgreSQL", "Python"]);
});

test("enrichJobsWithDescriptions fetches only the top N ranked jobs", async (t) => {
  clearPostingCache();
  t.after(restoreFetch);

  const calls = mockFetch(() => htmlResponse(postingHtml({ body: "React and TypeScript." })));

  const jobs = [
    jobFixture("801", "Warehouse Operations Associate"),
    jobFixture("802", "Full Stack Engineer"),
    jobFixture("803", "Radiology Technician"),
  ];

  const enriched = await enrichJobsWithDescriptions(jobs, resume, { limit: 1 });
  const byId = Object.fromEntries(enriched.map((j) => [j.id, j]));

  assert.equal(calls.length, 1, "only the top-ranked job should be fetched");
  assert.match(calls[0], /\/802$/, "the title matching the target role should rank first");
  assert.equal(byId["802"].requirements_source, "posting");
  assert.equal(byId["801"].requirements_source, "inferred");
  assert.equal(byId["803"].requirements_source, "inferred");
});

test("enrichJobsWithDescriptions honours its total time budget", async (t) => {
  clearPostingCache();
  t.after(restoreFetch);

  const calls = mockFetch(async () => {
    await new Promise((r) => setTimeout(r, 30));
    return htmlResponse(postingHtml({ body: "React." }));
  });

  const jobs = Array.from({ length: 8 }, (_, i) => jobFixture(String(700 + i), "Full Stack Engineer"));
  const enriched = await enrichJobsWithDescriptions(jobs, resume, {
    concurrency: 1,
    budgetMs: 45, // enough for one or two fetches, not eight
  });

  assert.ok(calls.length < jobs.length, `budget should cut the run short, made ${calls.length} calls`);
  assert.equal(enriched.length, jobs.length, "every job is still returned");
  assert.ok(enriched.some((j) => j.requirements_source === "inferred"));
});

test("enrichJobsWithDescriptions reuses the cache across separate searches", async (t) => {
  clearPostingCache();
  t.after(restoreFetch);

  const calls = mockFetch(() => htmlResponse(postingHtml({ body: "React, AWS and Docker." })));
  const jobs = [jobFixture("601", "Full Stack Engineer"), jobFixture("602", "Full Stack Engineer")];

  await enrichJobsWithDescriptions(jobs, resume);
  assert.equal(calls.length, 2);

  // A second user searching the same market hits the same postings.
  const second = await enrichJobsWithDescriptions(jobs, resume);
  assert.equal(calls.length, 2, "repeat searches must be served from cache");
  assert.equal(getPostingCacheStats().hits, 2);
  assert.ok(second.every((j) => j.requirements_source === "posting"));
});

test("a posting whose body names no recognizable skills yields an honest empty list", async (t) => {
  clearPostingCache();
  t.after(restoreFetch);

  mockFetch(() =>
    htmlResponse(postingHtml({ body: "We are a fast growing team. Apply via our careers page." }))
  );

  const [enriched] = await enrichJobsWithDescriptions([jobFixture("999", "Full Stack Engineer")], resume);

  assert.equal(enriched.requirements_source, "posting");
  assert.deepEqual(enriched.skills_required, []);

  const [scored] = scoreJobsWithResume([enriched], resume);
  assert.equal(scored.match_confidence, "low");
});
