# Implementation Plan — Phased Build

> Companion to `idea.md`. That document is the *what* and *why*; this is the *in what order*, *what you need first*, and *what to paste at me*.
>
> **I will not act on any of this until you paste one of these prompts to me as an instruction.** Feed them one at a time, in order. Each phase assumes the previous one is merged and passing.
>
> Every prompt below already embeds the standing guardrails from §0.3 — you don't need to repeat them.

---

## 0. Before You Start

### 0.1 Scope

Personal use, shared with friends for testing — **10–100 total users over the test period**, not concurrent. Not a launch.

This is why the plan is six phases rather than nine. `idea.md` §8 records what a product build would have added and why none of it applies here.

### 0.2 What you need

**Nothing new for Phases 1, 3, 4, 5, and 6.** Your existing `.env.local` — `DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `BRIGHTDATA_API_KEY`, `BRIGHTDATA_DATASET_ID` — covers everything.

| Phase | What | Required? |
|---|---|---|
| 2 | **Python 3 + pip** | Yes — most open-source resume parsers are Python. Phase 2 step 1 confirms what's actually installable. |
| 2 | `unpdf` *or* `pdfjs-dist` | Yes — npm, decided in Phase 2 step 1 |
| 2 | Free-tier commercial parsing API | Optional third opinion; two parsers is enough |
| 1 | A proxy for LinkedIn fetches | Only if the per-job endpoint blocks you. Bright Data is already in the stack — no new vendor. |

**On Gemini billing:** at ~30–70 calls/day the free tier should hold. If you hit limits, enabling billing costs roughly **$3–8/month** at this scale — cheaper than engineering around quotas. Not a prerequisite; just don't be surprised if chat usage pushes you over.

**Do not install anything not listed here without asking me first** — that rule is in every prompt below.

### 0.3 Standing guardrails (embedded in every prompt)

- Never touch Better Auth config, session handling, or the `[...all]` route.
- **Never persist resume or profile text** (CLAUDE.md §5.2). These are your friends' resumes, not just yours — the guarantee holds.
- Never fabricate job IDs, apply URLs, or company slugs (CLAUDE.md §5.3).
- Never invent metrics or sample data presented as real. If a real number isn't available, say so.
- `npm run build`, `npm run lint`, and `npm test` must pass before a phase is done.
- Keep existing exported names, props, and signatures stable unless the phase says otherwise.
- Stop and ask rather than guessing when a decision would be expensive to reverse.

### 0.4 Phase map

```
Phase 1  Job matching fixes + description caching
Phase 2  Parser bench + fixture matrix
Phase 3  Structural ATS checks
Phase 4  LLM content layer + /enhance
Phase 5  Regression check set
Phase 6  Chat + rate limiting
```

Phase 5 lands *after* the features deliberately. At product scale a harness gates everything; at this scale you want something working first, then a safety net for changes.

---

## Phase 1 — Job Matching Fixes + Description Caching

**Goal:** make `match_score` mean something.
**Deliverables:** real descriptions fetched and cached, circular seeding removed, scoring fixed, tests.
**Exit criteria:** scores span a real range, no job's `skills_required` derives from the candidate's own skills, `npm test` green.

**Expect scores to drop visibly.** That's the fix working.

```
Read idea.md §7, and CLAUDE.md §7 items 5, 6, and 7 before changing anything.

Fix the job matching data layer in src/lib/jobs.ts. Work in this order and stop at step 1 if it fails.

1. VERIFY FIRST, BUILD SECOND. Before writing any integration code, write a throwaway script in the scratchpad that fetches a single known-good job ID from LinkedIn's per-job guest endpoint (jobs-guest/jobs/api/jobPosting/{id}) and prints the response status plus the first 500 characters. Run it 5 times with a short delay. Report to me: does it work, what does the response look like, and did any request get blocked or rate-limited? If it does NOT work reliably, STOP and tell me — do not fall back to inventing descriptions, and do not proceed to steps 2-6.

2. If step 1 succeeded, add a description fetch to the search pipeline:
   - Fetch descriptions only for the top N results after the existing cheap ranking, not every result. Default N to 25 as a named constant.
   - Fetch in parallel with a concurrency cap, a per-request timeout consistent with the existing 9000ms pattern, and a total time budget so a slow LinkedIn never hangs the route.
   - On failure for any individual job, fall back to inferSkillsFromTitle for that job only, and mark the listing so the UI can distinguish real requirements from inferred ones. Add a field to JobListing for this.
   - Strip HTML to plain text. Never send raw HTML into a model.

3. Cache fetched descriptions by job ID with a TTL. Users search a similar market, so the same postings recur across people — this cuts LinkedIn load and speeds up repeat searches. An in-memory cache is fine at this scale; do not add Redis or a new dependency. Make the TTL a named constant and tell me what you picked.

4. Parse real skills from the fetched description text and use them for skills_required. Keep inferSkillsFromTitle as the named fallback path only.

5. Remove the candidate-skill seeding in inferSkillsFromTitle (jobs.ts:93) entirely. This is the circularity from CLAUDE.md §7 item 5 — jobs must never be constructed to require skills the candidate has.

6. Fix scoreJobsWithResume:
   - Replace the bidirectional substring match (jobs.ts:421) with token-boundary matching so "Java" no longer matches "JavaScript" and "R" no longer matches "React". Normalise case and punctuation, but do NOT add fuzzy or semantic matching — that is idea.md §7.3, keep this phase deterministic.
   - Replace the 62 + skillRatio * 33 formula so the score uses the full 0-100 range.
   - When a job has no usable skills data, do not default skillRatio to 0.7. Return a low-confidence result and expose that confidence so the UI can label it.

7. Extend test/jobs.test.mjs to cover: token-boundary matching (including the Java/JavaScript and R/React collisions specifically), the full score range, the no-skills-data path, the cache hit/miss paths, and the description-fetch fallback. Mock all network calls — no live LinkedIn requests in the test suite.

8. Update CLAUDE.md §7 to mark items 5-7 resolved, and §1 if the job pipeline description is now inaccurate.

Constraints: do not touch auth, the resume pipeline, or any UI component. Do not add any npm dependency. Do not generate synthetic job listings anywhere in this code path.

Report to me when done: the step-1 findings, the new score distribution across a sample search versus the old one, the cache TTL you chose, and anything you found that CLAUDE.md §7 didn't already list.
```

---

## Phase 2 — Parser Bench + Fixture Matrix

**Goal:** derive the ATS check list *and its severity weights* from measurement.
**Deliverables:** parser bench, ~12–15 single-variable fixtures, measured weights, check registry.
**Exit criteria:** a registry where every check carries a measured severity.

**This is the messiest phase practically.** Generating PDFs that differ on exactly one dimension is fiddly, and most OSS resume parsers are Python. The prompt front-loads both. Treat 1–2 days as optimistic.

```
Read idea.md §1.1 in full — the whole phase is built on it.

Build the parser test bench and the fixture matrix.

1. TOOLING SURVEY FIRST. Before building anything, survey what's available and report back with a recommendation:
   - Which open-source resume parsers currently work and are installable (most are Python — a Python subprocess boundary is acceptable, tell me if you'd rather avoid it). Two is enough; a third is optional.
   - How to generate the PDF fixtures: HTML + headless Chrome, LaTeX, or a PDF library. Pick based on which gives precise control over column layout and text-layer presence, since those are the two most important dimensions.
   STOP after this step and wait for me to confirm before building.

2. Build the fixture matrix. Hold resume CONTENT constant and vary exactly one dimension per fixture, covering the dimensions in idea.md §1.1. Target ~12-15 fixtures, NOT 30 — cover formats a real user of this app would plausibly produce, and skip academic-CV or heavily-designed variants unless I say otherwise. Each fixture needs a machine-readable manifest naming the dimension varied and the expected field values, so scoring is automatic.

3. Build the bench runner: fixture × parser → field-extraction accuracy, comparing extracted fields against each manifest. Output a matrix, not a single number.

4. Compute severity weights. For each dimension, the measured drop in field-extraction accuracy versus the baseline fixture IS the severity. Emit as data, not prose.

5. Produce checks/registry.yaml with one entry per check: id, statement, layer (deterministic | llm | drop), measured severity, which parsers agreed, and a testable assertion. A check both parsers flag is solid; one only a single parser flags is low-confidence and must be marked as such, not shipped as fact.

6. Optionally harvest public "resume enhancer" prompt packs as HYPOTHESIS INPUT only — candidate dimensions to test. Do not copy their prose, do not adopt their severity claims. Timebox to an hour. Note source and licence for anything you use.

Constraints: the bench is a development tool, not product code — keep it out of the request path and the production bundle. Do not add npm dependencies beyond the PDF tooling agreed in step 1. Do not write any number into the registry you did not measure; mark placeholders as placeholders.

Report to me when done: the severity table, which checks the parsers disagreed on, and which contested claims from the prompt packs the bench actually settled.
```

---

## Phase 3 — Structural ATS Checks

**Goal:** implement the measured checks as product code.
**Prereqs:** Phase 2 registry exists.
**Exit criteria:** every `deterministic` check has an implementation and a test; weights come from the registry, not hardcoded guesses.

```
Read idea.md §1.1, §1.2, and §1.3, plus checks/registry.yaml from Phase 2.

Implement the deterministic structural checks as product code.

1. Add unpdf (or pdfjs-dist if Phase 2 concluded otherwise) for positioned text items — the gap in idea.md §1.2. Existing multimodal Gemini parsing reads content but reveals nothing about structure.

2. Create src/lib/resume-ats.ts implementing every check marked `deterministic` in the registry:
   - Pure, side-effect-free functions. No network, no model calls, no coupling to the request path. idea.md §6 reuses this module as a regression grader, which is why it must stay pure.
   - Severity weights READ FROM the registry, not hardcoded. Registry changes should change scoring with no code edit.
   - Every check returns a structured finding, never a bare boolean, so the UI can explain it.

3. Implement score assembly: TypeScript applies registry weights to findings, producing ats_score plus sub_scores. Must be deterministic — same input, same output, every time. No model involvement in this file.

4. Add ResumeAudit and ResumeIssue to src/lib/types.ts, following the idea.md §1.4 sketch adjusted to what the registry actually needs.

5. Write test/resume-ats.test.mjs covering every implemented check, using the Phase 2 fixtures as inputs. Include at least one test asserting score determinism across repeated runs.

Constraints: no model calls in this file, ever. Do not implement checks marked `llm` or `drop`. Do not invent a check that isn't in the registry — if you think one is missing, tell me and I'll decide whether to measure it.

Report to me when done: which registry checks are implemented, which were skipped and why, and the determinism test result.
```

---

## Phase 4 — LLM Content Layer + `/enhance`

**Goal:** ship the feature.
**Exit criteria:** `/enhance` works end to end, the prompt is short.

**Note the ordering inside this prompt:** the shared intake component comes first.

```
Read idea.md §1.1 (division of labour table), §1.3, §1.4, §1.5, and §1.6.

Build the LLM content layer and the /enhance route.

1. FIRST, extract the shared intake component. src/components/JobMatcherClient.tsx owns the paste/PDF-base64 upload logic. Pull it into src/components/ResumeIntake.tsx and refactor JobMatcherClient to use it. Behaviour must be identical — verify the job matcher still works before moving on. Doing this after building /enhance means two copies of the same logic.

2. Create src/lib/resume-enhance.ts mirroring src/lib/resume.ts (schema-enforced output, model fallback chain, timeout handling) — match the house pattern rather than inventing a new one.

   The prompt must be SHORT — target roughly 400 words. It covers ONLY the subjective content checks from idea.md §1.1's division-of-labour table: weak/passive verbs, unquantified bullets, buzzword padding, tense drift, summary strength, keyword gaps versus a target JD. Everything structural was handled in Phase 3 and must not be re-checked here.

   If you find yourself wanting to add more rules, stop — idea.md §1.1 explains that instruction adherence degrades as rule count grows, and a long prompt is the failure mode this design exists to avoid.

3. The model returns findings and booleans only. It never returns a score. Scoring stays in Phase 3's TypeScript.

4. Create src/app/api/resume/enhance/route.ts following the exact pattern of src/app/api/resume/scan/route.ts: session guard, payload validation, maxDuration, structured errors. Accept an optional target job description for keyword-gap analysis.

5. Create src/app/enhance/page.tsx (auth-protected, matching how /jobs is protected) and src/components/ResumeEnhancerClient.tsx. The UI shows: score with sub-scores, issues grouped by severity with before/after, and copyable rewritten bullets.

6. Add the "Optimize for this job" entry point on job cards, passing that job's description into the enhancer.

7. Update the navbar for the new route, and update CLAUDE.md §1 and §3.

Constraints: v1 ships findings + copyable bullets + a plain-text ATS-safe version. Do NOT build .docx or .pdf generation — idea.md §1.6 rules it out. Do not persist the resume or the audit. Do not add npm dependencies.

Report to me when done: the final prompt word count, and what you deliberately left out of it.
```

---

## Phase 5 — Regression Check Set

**Goal:** a safety net for prompt changes, sized to the project.
**Exit criteria:** `npm run check` runs ~15–20 fixtures and reports deterministic scores.

**This is not an eval harness.** No slices, no CI gating, no per-model cost tracking — those exist to serve users you don't have.

```
Read idea.md §6. Note what it explicitly is NOT: a product-scale eval harness. Do not build one.

Build a small regression check set.

1. Create a checks/ or evals/ directory with ~15-20 fixtures (fixture + expected.json pairs) covering the resume shapes real users of this app actually have — likely tech, Indian market, early-to-mid career. Do NOT build slices for populations this app doesn't serve.

   Do not generate synthetic resumes and present them as the set. Build 5 examples so the format is unambiguous and the runner works end to end, clearly marked as examples, and give me a checklist of what I need to supply for the rest.

2. Implement deterministic graders only, for ParsedResume: skill-set precision/recall/F1, seniority exact match, years_of_experience absolute error, contact-field exact match, valid-JSON rate. No LLM judge — idea.md §6 explains that ParsedResume is structured enough that a judge isn't needed.

3. Reuse src/lib/resume-ats.ts from Phase 3 as the structural grader. Build once, use twice.

4. Write a README stating the two rules that make the set meaningful: never train on it, never edit a label to match model output.

5. Wire an `npm run check` script. Keep it OUT of `npm test` — it's slow and costs money, and must not gate ordinary commits.

6. Run it once against the current pipeline and commit the baseline.

Constraints: no CI integration, no per-model matrix, no cost tracking dashboards, no LLM judge. Keep it simple enough that running it stays a habit rather than a chore. Do not modify any src/lib pipeline behaviour — this observes, it does not change.

Report to me when done: the baseline numbers, and the checklist from step 1.
```

---

## Phase 6 — Chat + Rate Limiting

**Goal:** conversational agent over the user's resume and matched jobs.
**Exit criteria:** streams, calls tools, rate-limited, injection-resistant.

```
Read idea.md §2 (all of it) and §3.

Build the context chat.

1. Create src/app/api/chat/route.ts. The client posts the ParsedResume and JobListing[] it already holds in React state, plus message history. No database, no embeddings, no retrieval — §2.1 explains why the corpus fits in context and why implicit caching already handles the cost argument for RAG.

2. Streaming is mandatory: generateContentStream into a ReadableStream response. Tune maxDuration and tell me whether edge or node runtime is right here.

3. Rate limiting is REQUIRED (§2.3). At 10-100 users one person leaving a loop running can exhaust the day's quota for everyone. Keep it simple: a per-user daily message cap in Postgres or in-memory. Do NOT add Redis or a new vendor. Propose the approach before building it.

4. Prompt injection defence. Job descriptions are scraped from LinkedIn and are attacker-controllable text entering model context. Fence all scraped content in clear delimiters and instruct the model to treat it strictly as data, never instructions. Write at least one test with a job description containing an injection attempt.

5. Tool-calling so the agent can act, not just answer (§2.2): re-run a job search with different filters, re-score a job, trigger the enhancer. Reuse the existing lib functions — do not duplicate their logic.

6. Session guard matching the other routes.

7. Build the chat UI with streaming rendering, and update CLAUDE.md.

8. Log usage.total_cached_tokens somewhere visible so you can confirm implicit context caching is actually hitting (§2.1). If it isn't, the cost profile of this feature is very different and I want to know.

Constraints: no vector database, no embeddings, no persisted chat history. Do not store resume text anywhere. Do not add npm dependencies without asking.

Report to me when done: the rate-limiting approach, the injection test result, which tools you wired up, and whether caching is hitting.
```

---

## Appendix — Using These Prompts

- **Paste one at a time.** Each assumes the previous phase is merged and passing.
- **Phases 1 and 2 have explicit STOP points** where I report findings and wait. Both depend on external systems — LinkedIn's endpoints, OSS parser availability — that may have changed since this was written. Don't skip past them.
- **Edit before pasting** if you want to steer differently.
- **The "report to me" line at the end of each prompt is load-bearing.** It surfaces problems while they're still cheap to fix.
- If a phase turns out bigger than its prompt implies, say so and split it rather than pushing through.
- If this ever outgrows personal-plus-friends scale, `idea.md` §8 says what a product build would add, and git commits `2b3bfdd` / `df28197` have the full version.
