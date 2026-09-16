# ProfileExtract — Planned Features

> **Status**: Planning only. Nothing in this document is implemented yet.
> **Last updated**: 2026-09-17

## Scope

This is built **for personal use, shared with friends for testing** — on the order of **10–100 total users over the test period**, not concurrently. It is not a launch.

That scale is the single most important constraint in this document. It rules out most of what a product build would need (statistical eval harnesses, preference-data collection, model training) while keeping everything that multiple real people using it requires (privacy, basic rate limiting, regression checks). An earlier revision of this file planned for a product launch; §8 records what was dropped and why.

Three capabilities on top of the existing URL Extractor:

1. **Resume Enhancer** — audits an uploaded resume for ATS-friendliness and returns fixes.
2. **Job Matcher improvements** — the existing feature, made to actually work.
3. **Career Chatbot** — a conversational agent grounded on the user's resume and matched jobs.

---

## 0. Decisions Locked

| Decision | Choice | Why |
|---|---|---|
| Scale | Personal + friends testing, 10–100 total users | Determines everything below |
| Resume Enhancer placement | Its own route at `/enhance` | Also gets an "Optimize for this job" entry point from job cards |
| Chat persistence | **Stateless** — no stored resumes, no vector DB | Corpus fits in context; these are other people's resumes, so CLAUDE.md §5.2 holds |
| ATS score computation | Computed in **TypeScript** from bench-measured weights | An LLM-invented 0–100 score drifts ±15 points across identical runs |
| Billing | Free tier is likely sufficient; enable billing if it gets tight | ~30–70 calls/day at this scale. Paid would be ~$3–8/month |

### Open Questions

- **What exactly the chatbot is grounded on.** Current assumption: the user's own resume + the jobs the matcher returned.

---

## 1. Resume Enhancer (`/enhance`)

### 1.1 The Core Design Decision — Measure, Don't Aggregate

ATS-friendliness is an **empirical question with a ground truth**: does a real parser extract the fields correctly? Most tools in this market treat it as an editorial question instead — aggregating advice from blog posts and scoring against a proxy they invented. So does the obvious shortcut of merging several open-source "resume enhancer" prompt packs into one large instruction file.

Both lose for the same reason: they collect *claims about* ATS behaviour rather than measuring it. A merged mega-prompt also fails on its own terms — instruction adherence degrades as rule count grows, the sources contradict each other on contested points, and a prompt cannot detect a two-column layout or a scanned image no matter how it is worded.

**The approach here inverts that: build a parser test bench, and derive the checks and their weights from measurement.**

#### The parser bench

Two open-source resume parsers running locally, acting as the test oracle. A third opinion from a free-tier commercial API is optional, not required.

#### The fixture matrix

Take one resume's content and produce variants that each differ on **exactly one** dimension:

| Dimension | Variants |
|---|---|
| Column layout | single-column vs two-column |
| Text encoding | real text layer vs scanned image |
| Structure | tables vs plain paragraphs |
| Headings | standard ("Experience") vs creative ("Where I've Made Impact") |
| Bullets | glyph bullets vs hyphens |
| Contact placement | PDF header/footer vs document body |
| Date format | `MM/YYYY` vs `Month YYYY` vs mixed |

**Target ~12–15 fixtures, not 30.** Cover the formats you and your friends would plausibly produce. Academic-CV and heavily-designed variants can be skipped unless someone actually submits one — add them later if a real user's resume breaks.

Content is held constant, so any difference in parse quality is attributable to that single variable.

#### What the matrix produces

Run `fixture × parser → field-extraction accuracy`. **The delta each variation causes is the empirical severity of that check.**

This is what makes the score defensible. The rubric needs weights; without the bench those weights are guesses. With it, *"−12 for two-column"* means a measured field-extraction drop.

#### The division of labour

| Layer | Scope | Basis |
|---|---|---|
| **Parser bench** (TypeScript) | Everything structural — parseability, layout, headings, contact extraction, date consistency | Measured and weighted |
| **LLM prompt** (Gemini, schema-enforced) | Only subjective content quality — weak/passive verbs, unquantified bullets, buzzword padding, tense drift, summary strength, keyword gaps vs. a target JD | Judgement |

The prompt stays **short — roughly 400 words** — because the bench absorbs everything a prompt was never able to check.

#### Scoring

The model returns **findings and booleans**; it never returns the number. TypeScript applies the bench-derived weights. Reproducible, explainable, empirically grounded.

#### Where public prompt packs still fit

**Hypothesis generation only.** A free, fast list of candidate dimensions to test — worth about an hour. Do not ship their prose, and do not trust their severity claims; the bench decides those.

#### Honest caveat

Open-source parsers are not Workday or Greenhouse. They are a proxy too — just a far better one than folklore. Run **both** parsers and treat a check that only one flags as low-confidence.

### 1.2 Known Gap — PDF Structure Extraction

`parseResume` in `src/lib/resume.ts` hands the raw PDF to Gemini multimodally. That reads **content** fine but reveals nothing about **structure**, which is exactly what the bench-derived checks need.

**Required**: add `unpdf` or `pdfjs-dist` for positioned text items, enabling column/table detection and text-layer verification.

### 1.3 Planned File Structure

```
src/lib/resume-ats.ts              # bench-derived structural checks, pure functions
src/lib/resume-enhance.ts          # LLM content layer, mirrors resume.ts structure
src/app/api/resume/enhance/route.ts
src/app/enhance/page.tsx           # auth-protected
src/components/ResumeEnhancerClient.tsx
src/components/ResumeIntake.tsx    # shared, extracted from JobMatcherClient
test/resume-ats.test.mjs
```

### 1.4 New Types (sketch — for `src/lib/types.ts`)

```
ResumeAudit {
  ats_score: number                  // 0-100, computed in TS
  sub_scores: {
    parseability, keyword_match, formatting,
    impact_quantification, completeness, consistency
  }
  issues: ResumeIssue[]
  bullet_rewrites: { original, improved, rationale }[]
  keyword_gaps: string[]
  section_analysis: { section, present, note }[]
}

ResumeIssue {
  severity: "critical" | "warning" | "minor"
  category, section, problem, fix, before, after
}
```

### 1.5 Do This First

**Extract the resume intake UI before building `/enhance`.** `JobMatcherClient.tsx` owns the paste/PDF-base64 upload logic. Pull it into a shared `ResumeIntake` component, or the same file-reading logic gets maintained twice.

**Wire the enhancer to the Job Matcher.** An "Optimize for this job" button on each job card passes that description into the enhancer for targeted keyword-gap analysis.

### 1.6 Scope Guard

Generating a rewritten `.docx` / `.pdf` is a **separate project** (layout engine, templates, fidelity). v1 ships findings + copyable rewritten bullets + a plain-text ATS-safe version.

---

## 2. Career Chatbot

### 2.1 Why Not RAG

The corpus is one resume (~3k tokens) plus ~25 job descriptions (~15k tokens) — roughly 18k total, against a 1M context window. It fits many times over.

Retrieval would introduce a failure mode that otherwise cannot occur: fetch the wrong chunks and the model answers confidently from incomplete information. Aggregate questions ("which of these pay above X?") need *all* the jobs, not the top-5 semantically similar ones — and those are exactly what people ask a job chatbot.

**The cost argument for RAG is already handled.** Implicit context caching is enabled by default on all Gemini 2.5+ models, with a 2,048-token minimum — your ~18k corpus is nine times that. The repeated resume-and-jobs block is cached and billed at a reduced rate across turns automatically, with no code change. Check `usage.total_cached_tokens` in the response to confirm cache hits.

So RAG would cost infrastructure, chunking decisions, and a new class of wrong answers, to improve on a cost problem that is largely already solved.

### 2.2 The Approach — Context Chat

The client already holds `ParsedResume` and `JobListing[]` in React state. It posts those plus message history to `/api/chat`; Gemini's reply streams back. No database, no embeddings, no new infrastructure.

**Give it tool-calling so it can act**: re-run a job search with different filters, re-score a job, trigger the enhancer. Acting is worth more than retrieval sophistication.

### 2.3 Rate Limiting — Required

Every existing endpoint is one-shot and self-limiting. Chat is the first unbounded one, and at 10–100 users a single person leaving a loop running can exhaust the day's quota for everyone.

Keep it simple at this scale: a per-user daily message cap in Postgres, or even in-memory. No Redis, no new vendor.

### 2.4 When RAG Becomes Right

Revisit immediately if any of these become true:

- Chat should cover **every job ever searched**, not just the current 25
- You add a **knowledge base** — salary benchmarks, company research, interview prep
- **Multi-document upload** or chat history spanning sessions

The deciding question is "does the corpus still fit?", not "is RAG more sophisticated?" Today it fits comfortably. If that changes, pgvector on the existing Postgres is the answer — not a new vector database.

---

## 3. Cross-Cutting Concerns

| Concern | Detail |
|---|---|
| **Streaming** | `generateContentStream` → `ReadableStream`. Chat without streaming feels broken. |
| **Rate limiting** | See §2.3. Required, kept simple. |
| **Prompt injection** | Job descriptions are scraped from LinkedIn — attacker-controllable text entering model context. Fence in delimiters, treat strictly as data. |
| **Auth** | Same `auth.api.getSession` guard as the other routes. |
| **Privacy** | CLAUDE.md §5.2 holds. These are other people's resumes, not just yours. |
| **`maxDuration`** | Needs tuning for streaming; check edge vs. node runtime. |

---

## 4. Build Order

| # | Work | Effort |
|---|---|---|
| 1 | Job matching fixes + description caching (§7) | 1 day |
| 2 | Parser bench + ~12–15 fixtures (§1.1) | 1–2 days |
| 3 | Structural checks in `resume-ats.ts` + `unpdf` (§1.2) | 1 day |
| 4 | LLM content layer + scoring + `/enhance` UI (§1.3) | 1–2 days |
| 5 | Regression check set (§6) | ~half a day |
| 6 | Chat + rate limiting (§2) | 1–2 days |

**Total: roughly 5–7 days.**

Note that §6 lands *after* the features. At product scale a harness gates everything; at this scale you want something working first, then a safety net for changes.

---

## 5. Explicitly Out of Scope

- Rewritten `.docx` / `.pdf` generation
- Vector database, embeddings for chat, persistent chat history
- Storing resumes or audit results
- Anything in §8

---

## 6. Regression Checks

Not an eval harness — a safety net.

At 10–100 users you cannot justify a 200-fixture golden set with per-slice statistics and CI gating. But you also cannot verify a prompt change by eye once real people depend on the output.

**The right size: ~15–20 fixtures, run manually when you change a prompt.**

- Draw them from the resume shapes your actual users have — likely tech, Indian market, early-to-mid career. Don't build slices for populations you don't serve.
- Deterministic graders only: skill-set precision/recall, seniority exact match, years-of-experience error, contact-field match, valid-JSON rate. `ParsedResume` is structured, so this covers most of what matters without an LLM judge.
- **Never train on them, never edit a label to match model output.** These two rules are what makes the set mean anything.
- Keep them out of `npm test` — slow, paid, noisy. A separate `npm run check` is enough.
- The parser bench from §1.1 doubles as the structural grader. Build once, use twice.

---

## 7. Job Matching Quality

### 7.1 The bottleneck is the input data, not the model

An audit of `src/lib/jobs.ts` found the fit score close to meaningless, for reasons no model upgrade fixes. Logged as CLAUDE.md §7 items 5–7:

**Job descriptions are not real.** [`src/lib/jobs.ts:240`](src/lib/jobs.ts#L240) sets `description` to a hardcoded template. The LinkedIn guest **search** endpoint returns only title, company, and location, so no requirements text exists anywhere in the system.

**`skills_required` is guessed from the title,** and [`jobs.ts:93`](src/lib/jobs.ts#L93) seeds those skills with the candidate's own:

```ts
candidateSkills.slice(0, 4).forEach((s) => baseSkills.add(s));
```

Every job is constructed to require up to four skills the candidate definitionally has, then scored on how many match. **The score is matching the resume against itself.**

**The score cannot go below 62.** `62 + skillRatio * 33` compresses everything into 62–95, and an empty skill list defaults `skillRatio` to `0.7`. Separately [`jobs.ts:421`](src/lib/jobs.ts#L421) matches by bidirectional substring containment, so "Java" matches "JavaScript" and "R" matches "React".

### 7.2 Fix the input first

LinkedIn exposes a **per-job** guest endpoint (`jobs-guest/jobs/api/jobPosting/{id}`) returning the posting body. **Needs verifying** it still works and is not aggressively rate-limited.

**Cache fetched descriptions by job ID.** At 10–100 users searching a similar market, two people looking for "React developer, Bangalore" hit the same postings. A TTL cache cuts LinkedIn load substantially and speeds up searches. Concurrency is low at this scale so it is hygiene rather than urgent architecture — but it is cheap and it reduces cumulative block risk from one IP.

Alongside:

- Remove the candidate-skill seeding (kill the circularity)
- Replace substring containment with token-boundary matching
- Let the score use its full range instead of flooring at 62
- Keep `inferSkillsFromTitle` only as a fallback when a fetch fails

### 7.3 Then, if it still needs improving

Worth doing only after §7.2, and only if matching still feels wrong:

| Technique | Why it helps |
|---|---|
| **Skill taxonomy** (ESCO or O\*NET — free bulk downloads, no API key) | Canonical skills with alias sets. Deterministic and auditable. |
| **Embeddings for semantic matching** | Embed resume and each JD, cosine similarity as a scoring feature. Pairwise similarity, **not RAG** — no vector store. Catches equivalences no string match does. |
| **Retrieve-then-rerank** | Cheap filter, then one LLM call reranking the top ~25 with full descriptions. Also bounds how many descriptions need fetching. |
| **Thinking budget** | Enable for fit scoring, leave off for extraction. Note: thinking tokens bill as *output* tokens, so measure the cost delta. |
| **Split the mega-schema** | `resumeResponseSchema` does extraction *and* judgement in one call. Separating them usually improves both. |

**Will not help:** a bigger model everywhere, agent frameworks, RAG for matching.

Use the §6 fixtures to confirm each one actually helped. Anything with a flat or negative result gets reverted, however sophisticated it seems.

---

## 8. Deferred — Only If This Becomes a Product

An earlier revision of this document planned a full product build: a 200-fixture eval harness with per-slice statistics and CI gating, interaction-signal instrumentation to accumulate preference pairs, and a model training track (SFT → DPO → RLVR) built on that data.

**All of it is cut**, because every piece was justified by scale this project does not have. 100 users will not produce thousands of preference pairs. Per-slice statistics need more documents than you will ever collect. Training a model requires data volume that will not accumulate in a year.

The full reasoning is preserved in git — commits `2b3bfdd` and `46f1cc3` — if this ever outgrows the current scope. Two things from it remain worth knowing:

- **The verifier suite is reusable.** The §1.1 parser bench serves as product feature, regression grader, and — if training ever happened — an RLVR reward environment. That is why §1.1 is worth building properly.
- **Nothing past supervised tuning is possible on the Gemini API.** Any real training work means open weights and rented GPUs. Not a near-term concern.
