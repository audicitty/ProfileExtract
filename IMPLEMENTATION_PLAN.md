# Implementation Plan — Phased Build

> Companion to `idea.md`. That document is the *what* and *why*; this is the *in what order*, *what you need first*, and *what to paste at me*.
>
> **I will not act on any of this until you paste one of these prompts to me as an instruction.** Feed them one at a time, in order. Each phase assumes the previous one is merged and passing.
>
> Every prompt below already embeds the standing guardrails from §0.3 — you don't need to repeat them.

---

## 0. Before You Start

### 0.1 Two decisions that block later phases

| Decision | Blocks | Default if you don't decide |
|---|---|---|
| **Collect interaction signal?** (`idea.md` §7) | Phase 8, and the whole §9 training track | Stays stateless; Phase 8 never happens and no preference data accumulates |
| **What the chatbot is grounded on** (`idea.md` §0) | Phase 7 scope | Resume + matched jobs only |

Neither blocks Phases 1–6. Decide them before Phase 7.

### 0.2 What you need to have

| Phase | New dependency | Account / external | Notes |
|---|---|---|---|
| 1 | — | — | Uses existing LinkedIn guest endpoints |
| 2 | — | — | `tsx` already present; cost is labelling time, not software |
| 3 | `unpdf` *or* `pdfjs-dist` | Python 3 + pip (most OSS resume parsers are Python) | Messiest phase practically — see §3 risks |
| 4 | — | — | Consumes Phase 3 output |
| 5 | — | Existing Gemini key | — |
| 6 | — | ESCO or O\*NET bulk download (free, registration) | Embeddings use the existing Gemini key |
| 7 | — | — | — |
| 8 | — | — | Drizzle migration; gated on §0.1 |

**Do not install anything not listed here without asking me first** — that rule is in every prompt below.

### 0.3 Standing guardrails (embedded in every prompt)

- Never touch Better Auth config, session handling, or the `[...all]` route.
- Never persist resume or profile text (CLAUDE.md §5.2), unless the phase explicitly says so *and* §0.1 was decided.
- Never fabricate job IDs, apply URLs, or company slugs (CLAUDE.md §5.3).
- Never invent metrics, benchmark numbers, or sample data presented as real. If a real number isn't available, say so.
- `npm run build`, `npm run lint`, and `npm test` must all pass before a phase is called done.
- Keep existing exported names, props, and function signatures stable unless the phase says otherwise.
- Stop and ask rather than guessing when a decision would be expensive to reverse.

### 0.4 Phase map

```
Phase 1  Fix job matching data layer        ← correctness bugs, no eval needed
Phase 2  Eval harness + golden set          ← everything after this is measurable
Phase 3  Parser bench + fixture matrix      ← produces checks AND their weights
Phase 4  Structural ATS checks              ← consumes Phase 3
Phase 5  LLM content layer + /enhance UI    ← the shippable feature
Phase 6  Semantic matching upgrade          ← measured against Phase 2 baseline
Phase 7  Chatbot                            ← needs §0.1 decision
Phase 8  Instrumentation                    ← needs §0.1 decision
Phase 9  (Deferred) training track          ← no prompt; gated on data volume
```

**On the ordering:** `idea.md` §10.5 says build the eval harness before the improvements. Phase 1 comes first anyway because those are *correctness bugs*, not quality improvements — removing a circular score doesn't need an A/B to justify. The §10.3 improvements (Phase 6) do, and they sit after Phase 2 accordingly.

---

## Phase 1 — Fix the Job Matching Data Layer

**Goal:** make `match_score` mean something.
**Prereqs:** none.
**Deliverables:** real job descriptions fetched, circular seeding removed, scoring fixed, tests.
**Exit criteria:** scores span a real range, no job's `skills_required` is derived from the candidate's own skills, `npm test` green.

**Risks:** the per-job LinkedIn endpoint may be rate-limited or may have changed. The prompt handles that with a verify-first step rather than assuming.

**Expect scores to drop visibly.** That's the fix working — see the note at the end of this phase.

```
Read idea.md §10.1 and §10.2, and CLAUDE.md §7 items 5, 6, and 7 before changing anything.

Fix the job matching data layer in src/lib/jobs.ts. Work in this order and stop at step 1 if it fails.

1. VERIFY FIRST, BUILD SECOND. Before writing any integration code, write a throwaway script in the scratchpad that fetches a single known-good job ID from LinkedIn's per-job guest endpoint (jobs-guest/jobs/api/jobPosting/{id}) and prints the response status plus the first 500 characters. Run it 5 times with a short delay. Report to me: does it work, what does the response look like, and did any request get blocked or rate-limited? If it does NOT work reliably, STOP and tell me — do not fall back to inventing descriptions, and do not proceed to steps 2-5.

2. If step 1 succeeded, add a description fetch to the search pipeline. Requirements:
   - Fetch descriptions only for the top N results after the existing cheap ranking, not for every result. Default N to 25 and make it a named constant.
   - Fetch in parallel with a concurrency cap, a per-request timeout consistent with the existing 9000ms pattern, and a total time budget so a slow LinkedIn never hangs the route.
   - On fetch failure for any individual job, fall back to the current inferSkillsFromTitle behaviour for that job only, and mark the listing so the UI can tell real requirements from inferred ones. Add a field to JobListing for this.
   - Strip HTML to plain text. Do not send raw HTML into any model.

3. Parse real skills from the fetched description text and use them for skills_required. Keep inferSkillsFromTitle as the named fallback path only.

4. Remove the candidate-skill seeding in inferSkillsFromTitle (jobs.ts:93) entirely. This is the circularity from CLAUDE.md §7 item 5 — jobs must never be constructed to require skills the candidate has.

5. Fix scoreJobsWithResume:
   - Replace the bidirectional substring match (jobs.ts:421) with token-boundary matching so "Java" no longer matches "JavaScript" and "R" no longer matches "React". Normalise case and punctuation, but do NOT add fuzzy or semantic matching — that is Phase 6, keep this phase deterministic.
   - Replace the 62 + skillRatio * 33 formula so the score uses the full 0-100 range.
   - When a job has no usable skills data, do not default skillRatio to 0.7. Return a low-confidence result and expose that confidence in the response so the UI can label it.

6. Extend test/jobs.test.mjs to cover: token-boundary matching (including the Java/JavaScript and R/React collisions specifically), the full score range, the no-skills-data path, and the description-fetch fallback path. Mock all network calls in tests — no live LinkedIn requests in the test suite.

7. Update CLAUDE.md §7 to mark items 5-7 resolved, and update §1 if the job pipeline description there is now inaccurate.

Constraints: do not touch auth, the resume pipeline, or any UI component in this phase. Do not add any npm dependency. Do not generate synthetic job listings anywhere in this code path.

Report to me when done: the step-1 findings, the new score distribution across a sample search versus the old one, and anything you found that CLAUDE.md §7 didn't already list.
```

> **After this phase:** users who saw 87% yesterday may see 61% today for the same job. The score became honest, it didn't regress. If the enhancer is already live to real users at this point, consider a note in the UI.

---

## Phase 2 — Eval Harness + Golden Set

**Goal:** make every later change measurable.
**Prereqs:** Phase 1 merged.
**Deliverables:** `evals/` tree, deterministic graders, runner, first baseline report.
**Exit criteria:** `npm run eval` produces a per-slice report for the existing resume-parse and profile-extract pipelines, committed as a baseline.

**The real cost here is labelling, not code.** Budget time for building the golden set by hand; nothing else in this plan substitutes for it.

```
Read idea.md §6 in full before starting.

Build the evaluation harness described there. Scope this phase to the pipelines that already exist — resume parsing and URL profile extraction. Do not evaluate the enhancer; it isn't built yet.

1. Create the evals/ tree exactly as laid out in idea.md §6.8.

2. Build the runner (evals/runner.ts) as a matrix runner over suites × models. It must:
   - Record per run: prompt hash, model name and version, timestamp, git SHA.
   - Record per document: quality scores, tokens in/out, estimated cost, latency.
   - Emit one JSON report per run into evals/reports/, named so runs sort chronologically.
   - Support running a single suite or a single slice for fast iteration.

3. Implement the deterministic graders (evals/graders/structured.ts) for ParsedResume: skill-set precision/recall/F1, seniority exact match, years_of_experience absolute error, contact-field exact match, valid-JSON rate. These are the majority of what matters — do not reach for an LLM judge in this phase. Leave evals/graders/judge.ts as a stub with a TODO referencing idea.md §6.4.

4. Golden set: create the directory structure and a documented fixture format (fixture + expected.json pairs), plus a README in evals/datasets/ stating the three rules from idea.md §6.2 — never train on it, never edit a label to match model output, version it in git.

   Do NOT generate synthetic resumes and present them as the golden set. Instead: build 5 example fixtures so the format is unambiguous and the harness is runnable end to end, clearly marked as examples, and give me a short checklist of what I need to supply to build the real set. Tell me explicitly how many fixtures per slice you'd want for the numbers to be meaningful.

5. Implement the slices from idea.md §6.5 as a declarative evals/datasets/slices.json, and make the report break every metric down per slice. Never print a single aggregate number without the per-slice breakdown alongside it.

6. Wire npm scripts: `eval` for everything, plus per-suite variants. Keep evals OUT of `npm test` — idea.md §6.7 explains why, and this matters: evals are slow, paid, and noisy, and must not gate ordinary commits.

7. Run the harness across all three models in the existing fallback chain (gemini-2.5-flash, gemini-2.5-pro, gemini-flash-latest) on the example fixtures. Commit the baseline report.

Constraints: do not modify any src/lib pipeline behaviour in this phase — the harness observes, it does not change. Do not add npm dependencies beyond what's already in package.json. Do not call any paid API more than needed for the baseline run, and tell me the total estimated cost before running the full matrix.

Report to me when done: the baseline numbers per model per slice, what the cost and latency comparison says about whether the current fallback chain is ordered correctly, and the golden-set checklist from step 4.
```

---

## Phase 3 — Parser Bench + Fixture Matrix

**Goal:** derive the ATS check list *and its severity weights* from measurement.
**Prereqs:** Phase 2 merged (the bench reports into the same structure).
**Deliverables:** parser bench, ~30 single-variable fixtures, measured weights, check registry.
**Exit criteria:** a registry where every check carries a measured severity, and contested items are resolved or dropped.

**This is the messiest phase practically.** Generating PDF fixtures that differ on exactly one dimension is fiddly, and most OSS resume parsers are Python, so there's a language boundary. The prompt front-loads both problems.

```
Read idea.md §1.1 in full — the whole phase is built on it.

Build the parser test bench and the adversarial fixture matrix.

1. TOOLING SURVEY FIRST. Before building anything, survey what's actually available and report back to me with a recommendation:
   - Which open-source resume parsers currently work and are installable (most are Python — a Python subprocess boundary is acceptable, tell me if you'd rather avoid it).
   - Whether any free-tier commercial parsing API is worth adding as a third opinion.
   - How to generate the PDF fixtures: HTML + headless Chrome, LaTeX, or a PDF library. Pick based on which gives precise control over column layout and text-layer presence, since those are the two most important dimensions to vary.
   STOP after this step and wait for me to confirm the approach before building.

2. Build the fixture matrix. Hold resume CONTENT constant and vary exactly one dimension per fixture, covering the seven dimensions in idea.md §1.1. Each fixture needs a machine-readable manifest naming the dimension varied and the expected field values, so scoring is automatic.

3. Build the bench runner: fixture × parser → field-extraction accuracy. Compare each parser's extracted fields against the fixture manifest. Output a matrix, not a single number.

4. Compute severity weights. For each dimension, the measured drop in field-extraction accuracy versus the baseline fixture IS the severity. Emit these as data, not prose.

5. Produce checks/registry.yaml with one entry per check: id, statement, layer (deterministic | llm | drop), measured severity, which parsers agreed, and a testable assertion. Apply the agreement rule from idea.md §1.1: a check that breaks three independent parsers is real; one that breaks a single parser is that parser's quirk and must be marked low-confidence, not shipped as fact.

6. Optionally harvest public "resume enhancer" prompt packs as HYPOTHESIS INPUT only — a list of candidate dimensions to test. Do not copy their prose and do not adopt their severity claims. Timebox this to an hour. If you do use any, note the source and licence in the registry.

Constraints: the bench is a development tool, not product code — keep it out of the request path and out of the production bundle. Do not add npm dependencies beyond the PDF tooling agreed in step 1. Do not write any number into the registry that you did not measure; if something is a placeholder, mark it as one.

Report to me when done: the severity table, which checks the parsers disagreed on, and which contested items from the prompt packs the bench actually settled.
```

---

## Phase 4 — Structural ATS Checks

**Goal:** implement the measured checks as product code.
**Prereqs:** Phase 3 registry exists.
**Deliverables:** `src/lib/resume-ats.ts`, `unpdf` integration, unit tests.
**Exit criteria:** every `deterministic` check in the registry has an implementation and a test; weights come from the registry, not from hardcoded guesses.

```
Read idea.md §1.1, §1.2, and §1.3, plus the checks/registry.yaml produced in Phase 3.

Implement the deterministic structural checks as product code.

1. Add unpdf (or pdfjs-dist if Phase 3 concluded otherwise) to get positioned text items from a PDF — this is the gap described in idea.md §1.2. Existing multimodal Gemini parsing reads content but reveals nothing about structure.

2. Create src/lib/resume-ats.ts implementing every check marked `deterministic` in the registry. Requirements:
   - Pure, side-effect-free functions with no coupling to the request path, no network, no model calls. idea.md §8.1 explains why this matters: the same module is reused as an eval grader and later as an RLVR reward function.
   - Severity weights are READ FROM the registry, not hardcoded. If the registry changes, the scoring changes with no code edit.
   - Every check returns a structured finding, never a bare boolean, so the UI can explain it.

3. Implement the score assembly: TypeScript applies registry weights to findings and produces ats_score plus sub_scores. The score must be deterministic — same input, same output, every time. No model involvement anywhere in this file.

4. Add the ResumeAudit and ResumeIssue types to src/lib/types.ts, following the sketch in idea.md §1.4 but adjusted to whatever the registry actually needs.

5. Write test/resume-ats.test.mjs covering every implemented check, using the Phase 3 fixtures as test inputs. Include at least one test asserting score determinism across repeated runs.

6. Wire src/lib/resume-ats.ts into evals/graders/ats-verifier.ts so the eval harness can use it, per idea.md §6.3.

Constraints: no model calls in this file, ever. Do not implement checks marked `llm` or `drop` in the registry — those are Phase 5 or excluded. Do not invent a check that isn't in the registry; if you think one is missing, tell me and I'll decide whether to measure it in a Phase 3 follow-up.

Report to me when done: which registry checks are implemented, which were skipped and why, and the score determinism test result.
```

---

## Phase 5 — LLM Content Layer + `/enhance`

**Goal:** ship the user-facing feature.
**Prereqs:** Phase 4 merged.
**Deliverables:** `resume-enhance.ts`, API route, page, client component, shared `ResumeIntake`.
**Exit criteria:** `/enhance` works end to end, the prompt is short, the eval suite covers it.

**Note the ordering inside this prompt:** the shared intake component comes first. Building `/enhance` before extracting it means maintaining the same PDF-upload logic twice.

```
Read idea.md §1.1 (division of labour table), §1.3, §1.4, §1.5, and §1.6.

Build the LLM content layer and the /enhance route.

1. FIRST, extract the shared intake component. src/components/JobMatcherClient.tsx currently owns the paste/PDF-base64 upload logic. Pull it into src/components/ResumeIntake.tsx and refactor JobMatcherClient to use it. Behaviour must be identical — verify the job matcher still works before moving on. Doing this after building /enhance would mean two copies of the same logic.

2. Create src/lib/resume-enhance.ts. Mirror the structure of src/lib/resume.ts (schema-enforced output, model fallback chain, timeout handling) — match the existing house pattern rather than inventing a new one.

   The prompt must be SHORT — target roughly 400 words. It covers ONLY the subjective content checks from idea.md §1.1's division-of-labour table: weak/passive verbs, unquantified bullets, buzzword padding, tense drift, summary strength, keyword gaps versus a target JD. Everything structural was handled in Phase 4 and must not be re-checked here.

   If you find yourself wanting to add more rules to the prompt, stop — idea.md §1.1 explains that instruction adherence degrades as rule count grows, and a long prompt is the failure mode this design exists to avoid.

3. The model returns findings and booleans only. It never returns a score. Scoring stays in Phase 4's TypeScript.

4. Create src/app/api/resume/enhance/route.ts following the exact pattern of src/app/api/resume/scan/route.ts: session guard, payload validation, maxDuration, structured error responses. Accept an optional target job description for keyword-gap analysis.

5. Create src/app/enhance/page.tsx (auth-protected, matching how /jobs is protected) and src/components/ResumeEnhancerClient.tsx. The UI shows: score with sub-scores, issues grouped by severity with before/after, and copyable rewritten bullets.

6. Add the "Optimize for this job" entry point on job cards, passing that job's description into the enhancer (idea.md §1.5 item 2).

7. Add a resume-enhance eval suite to the Phase 2 harness.

8. Update the navbar for the new route, and update CLAUDE.md §1 and §3 to document the feature.

Constraints: v1 ships findings + copyable bullets + a plain-text ATS-safe version. Do NOT build .docx or .pdf generation — idea.md §1.6 rules it out of scope explicitly. Do not persist the resume or the audit anywhere. Do not add npm dependencies.

Report to me when done: the final prompt word count, what you deliberately left out of it, and the eval suite's first numbers.
```

---

## Phase 6 — Semantic Matching Upgrade

**Goal:** improve match quality, measurably.
**Prereqs:** Phases 1 and 2 merged — this is the first phase where the eval harness is load-bearing.
**Deliverables:** embedding similarity, skill taxonomy, reranking, before/after eval numbers.
**Exit criteria:** each technique shows a measured delta against the Phase 2 baseline. Anything that doesn't improve its metric gets reverted.

```
Read idea.md §10.3 and §10.4.

Implement the semantic matching improvements. Critical process requirement: implement them ONE AT A TIME, running the eval suite after each, and report the delta. Anything that doesn't measurably improve its metric gets reverted, not kept because it seems more sophisticated.

Order:

1. Skill taxonomy (§10.3 item 2). Integrate ESCO, O*NET, or Lightcast Open Skills for canonical skills with alias sets. Tell me which you picked and why, and confirm the licence permits commercial use before integrating. Deterministic alias resolution only at this step. Run evals, report delta.

2. Embedding similarity (§10.3 item 1). Use gemini-embedding-001 to embed the resume and each JD, adding cosine similarity as a scoring FEATURE alongside skill overlap — not as a replacement. This is pairwise similarity, NOT RAG: no vector store, no corpus, no persistence. Cache embeddings in memory per request only. Run evals, report delta.

3. Retrieve-then-rerank (§10.3 item 3). Cheap filter over all results, then one LLM call reranking the top ~25 with full descriptions. This also bounds how many Phase 1 description fetches are needed. Run evals, report delta including latency and cost.

4. Thinking budget (§10.3 item 4). Enable for fit scoring; leave it off for straight extraction where it only adds latency. Run evals, report the quality/latency/cost trade.

5. Split the resume mega-schema (§10.3 item 5) — separate factual extraction from judgement (seniority, target roles, search keywords) into distinct calls with appropriate temperatures. Run evals, report delta. Revert if extraction quality drops.

6. Validation and repair loop (§10.3 item 7): validate output against schema plus business rules, retry once with the error fed back on failure.

Constraints: no vector database, no persistence — idea.md §2.3 and §10.4 both rule these out for now. Do not implement anything from §10.4's "will not help" list. Do not keep a change whose eval delta is flat or negative, even if it feels more advanced.

Report to me when done: a table of technique × metric delta × cost delta × latency delta, and an explicit list of what you reverted.
```

---

## Phase 7 — Chatbot

**Goal:** conversational agent over the user's resume and matched jobs.
**Prereqs:** §0.1 grounding decision made.
**Deliverables:** streaming chat route, tool-calling, rate limiting, UI.
**Exit criteria:** streams, calls tools, rate-limited, injection-resistant.

```
Read idea.md §2 (all of it, including §2.3 on what is deliberately deferred) and §3.

Build the context chat. Confirm with me first what the chatbot is grounded on if I haven't already told you — idea.md §0 lists this as an open question and the answer changes the scope.

1. Create src/app/api/chat/route.ts. The client posts the ParsedResume and JobListing[] it already holds in React state, plus message history. No database, no embeddings, no retrieval — §2.1 explains why the corpus fits in context and RAG would be premature.

2. Streaming is mandatory: generateContentStream into a ReadableStream response. Chat without streaming feels broken. Tune maxDuration for streaming and tell me whether edge or node runtime is the right call here.

3. Rate limiting — this is a REQUIREMENT, not a nice-to-have. Chat is the first unbounded endpoint in the app; every existing route is one-shot and self-limiting. Implement per-user limits. Propose the approach before building it: nothing in the app does this today, so there's no existing pattern to follow.

4. Prompt injection defence. Job descriptions are scraped from LinkedIn and are attacker-controllable text entering the model context. Fence all scraped content in clear delimiters and instruct the model to treat it strictly as data, never as instructions. Write at least one test with a job description containing an injection attempt.

5. Tool-calling so the agent can act, not just answer (§2.2): re-run a job search with different filters, re-score a job, trigger the enhancer. Reuse the existing lib functions — do not duplicate their logic.

6. Session guard matching the other routes.

7. Build the chat UI with streaming rendering, and update CLAUDE.md.

Constraints: no vector database, no embeddings, no persisted chat history — all deferred in §2.3. Do not store resume text anywhere. Do not add npm dependencies without asking.

Report to me when done: the rate-limiting approach you chose, the injection test result, and which tools you wired up.
```

---

## Phase 8 — Instrumentation

**Goal:** start accumulating the preference data that gates everything in §9.
**Prereqs:** **§0.1 decided in favour of collecting signal.** If not, skip this phase permanently.
**Deliverables:** event schema, opt-in UX, counterfactual logging, CLAUDE.md §5.2 amendment.
**Exit criteria:** events flow, no document text is stored, the privacy doc matches reality.

```
Read idea.md §7 in full. Do not start this phase unless I have explicitly told you I've decided to collect interaction signal — §7.1 describes a real conflict with the stateless guarantee in CLAUDE.md §5.2, and that's my call to make, not yours.

1. Implement the signal-without-document design from §7.2. Store what happened, never the document it happened to: variant B chosen over A by content hash, apply link clicked by job ID, ATS issue category marked fixed. Resume text is still discarded at session end.

2. Drizzle schema per the §7.5 sketch. Migration only — do not touch the existing auth tables.

3. Instrument the events in §7.3's table. Prioritise the implicit behavioural signals over explicit thumbs up/down. The highest-value one is a user correcting a mis-parsed field: that's a free labelled training example at the exact point the model failed, so make sure that path is captured.

4. Counterfactual logging per §7.4 — this is the step that's impossible to retrofit. Log which variants were shown, in what order, at what screen position, and which prompt/model version produced each. Without this the pairs can't be de-biased later and the entire collection effort is wasted.

5. Opt-in UX: explicit consent, a visible data control, a stated retention window. Default to NOT collecting until the user opts in.

6. Amend CLAUDE.md §5.2 to describe precisely what is and is not kept. The documented guarantee must match the code exactly — if they diverge, the doc is worse than useless.

Constraints: no document text, no resume content, no PII in the event payload — hashes and category labels only. Do not weaken the existing auth or session handling.

Report to me when done: the exact list of what is now stored, what is still discarded, and the diff to CLAUDE.md §5.2.
```

---

## Phase 9 — Training Track (Deferred, No Prompt)

`idea.md` §9. Not actionable until Phases 2 and 8 have run long enough to produce volume — thousands of preference pairs, and enough eval history to prove a trained model beats the baseline.

No prompt here on purpose. Writing one now would be planning against data that doesn't exist. Revisit when Phase 8 has been collecting for a few months.

The one thing worth remembering before then: none of SFT / DPO / RLVR is possible on the Gemini API. Anything past supervised tuning means moving part of the pipeline to open weights and renting GPUs.

---

## Appendix — Using These Prompts

- **Paste one at a time.** Each assumes the previous phase is merged and passing.
- **Phases 1 and 3 have explicit STOP points** where I report findings and wait. Those exist because both depend on external systems (LinkedIn's endpoints, OSS parser availability) that may have changed since this was written. Don't skip past them.
- **Edit before pasting** if you want to steer differently — these are starting points, not contracts.
- **The "report to me" line at the end of each prompt is load-bearing.** It's what surfaces problems while they're still cheap to fix.
- If a phase turns out bigger than its prompt implies, say so and split it rather than pushing through.
