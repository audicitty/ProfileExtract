# ProfileExtract — Planned Features

> **Status**: Planning only. Nothing in this document is implemented yet.
> **Last updated**: 2026-09-16

Two new capabilities planned on top of the existing URL Extractor and Job Matcher:

1. **Resume Enhancer** — audits an uploaded resume for ATS-friendliness and returns fixes.
2. **Career Chatbot** — a conversational agent grounded on the user's own resume and matched jobs.

---

## 0. Decisions Already Locked

| Decision | Choice | Why |
|---|---|---|
| Resume Enhancer placement | Its own route at `/enhance` | Standalone landing/SEO surface; also gets an "Optimize for this job" entry point from job cards |
| Chat persistence | **Stateless** — no stored resumes, no vector DB in v1 | Corpus fits in Gemini's context window; preserves the CLAUDE.md §5.2 guarantee that resumes are never persisted |
| ATS score computation | Computed in **TypeScript** from a fixed rubric | An LLM-invented 0–100 score drifts ±15 points across identical runs, and users re-upload to check |

### Open Questions

- **What exactly the chatbot is grounded on.** Current assumption: the user's own resume + the jobs the matcher returned. If the scope is broader (company research, salary benchmarks, interview prep), that content needs a source, and the stateless decision needs revisiting.
- **Rate limiting strategy.** Chat is the first unbounded endpoint in the app; nothing has rate limiting today.
- **Whether to collect interaction signal at all** (§7). This is the one decision that gates the entire model-training track, and it partially reopens the stateless guarantee. Unresolved.

---

## 1. Resume Enhancer (`/enhance`)

### 1.1 The Core Design Decision — Two Layers

A single "rate this resume 0–100" LLM call produces unstable output. The audit is split in two, and the score is assembled deterministically from both layers' findings.

#### Layer 1 — Deterministic checks (pure TypeScript, no model)

These decide whether an ATS can parse the file at all:

- **Text layer present?** Is the PDF real text, or a scanned image / text rendered as graphics? This is the single biggest real-world ATS failure.
- **Multi-column or table layout detection.** Most ATS parsers linearize columns and scramble the reading order.
- **Contact block parseable** — email, phone, location via regex.
- **Standard section headings present** — "Experience", not "Where I've Made Impact".
- **Date format consistency** across entries.
- **Word count, bullet density, non-ASCII glyph bullets.**

#### Layer 2 — LLM checks (Gemini, schema-enforced)

Content quality only:

- Weak/passive verbs
- Unquantified bullets (no metric, no outcome)
- Buzzword padding
- Tense inconsistency (present tense on past roles)
- Summary strength
- Keyword gaps versus a target role or pasted job description

#### Scoring

The model returns **findings and booleans**; it never returns the number. TypeScript applies a fixed weighted rubric. Result: reproducible and explainable — *"−12: three bullets have no metric."*

### 1.2 Known Gap — PDF Structure Extraction

`parseResume` in `src/lib/resume.ts` currently hands the raw PDF to Gemini multimodally. That reads **content** fine but reveals nothing about **structure**, which is exactly what Layer 1 needs.

**Required**: add `unpdf` or `pdfjs-dist` to get positioned text items, enabling column/table detection and text-layer verification.

Without this, only Layer 2 is possible and the "ATS-friendly" claim is half-true.

### 1.3 Planned File Structure

```
src/lib/resume-ats.ts              # Layer 1 — pure functions, easily unit-tested
src/lib/resume-enhance.ts          # Layer 2 — Gemini call, mirrors resume.ts structure
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

### 1.5 Two Things Worth Doing First

1. **Extract the resume intake UI before building `/enhance`.**
   `JobMatcherClient.tsx` currently owns the paste/PDF-base64 upload logic. Pull it into a shared `ResumeIntake` component first, or the same file-reading logic gets maintained in two places.

2. **Wire the enhancer to the Job Matcher.**
   An "Optimize for this job" button on each job card passes that job description into the enhancer for targeted keyword-gap analysis. This is the differentiator over generic ATS checkers, and the data is already in hand.

### 1.6 Scope Guard

Generating a rewritten `.docx` / `.pdf` is a **separate project** (layout engine, templates, visual fidelity). Do not let it creep into v1.

**v1 ships**: findings list + copyable rewritten bullets + a plain-text ATS-safe version.

---

## 2. Career Chatbot (`/chat` or embedded)

### 2.1 Why This Is Not RAG (v1)

If the chat covers the user's own resume and their matched jobs, the entire corpus is:

- One resume: ~3k tokens
- ~25 job descriptions: ~15k tokens

That fits in Gemini 2.5 Flash's context window many times over. Chunking, embedding, and similarity search would add a vector database, a migration, and a retrieval-quality problem — to solve a problem that does not exist at this scale.

### 2.2 Chosen Approach — Context Chat

The client already holds `ParsedResume` and `JobListing[]` in React state. It posts those plus message history to `/api/chat`, and Gemini's reply streams back.

- No database, no embeddings, no new infrastructure
- Stays stateless — privacy guarantee intact
- Roughly **1–2 days** of work

**Give it tool-calling so it can act, not just answer:**

- Re-run a job search with different filters
- Re-score a specific job against the resume
- Trigger the Resume Enhancer

Acting is worth more to the user than retrieval sophistication.

### 2.3 Deferred — True RAG (Option B)

Only worth building when the corpus outgrows the context window or must persist across sessions. Triggering conditions:

- A curated career knowledge base (ATS guides, salary benchmarks, company research, interview banks)
- Multi-document upload with cross-session history

If that day comes, the design is:

- **Vector store: pgvector on the existing Postgres.** Drizzle supports `vector` columns and cosine ops. Pinecone/Qdrant would be vendor sprawl for zero gain at this scale. Needs `CREATE EXTENSION vector` (Supabase and Neon both support it) and an HNSW index.
- **Embeddings: `gemini-embedding-001`** — keeps the app on a single AI vendor.
- **Chunking on semantic boundaries, not fixed windows.** One job posting = one chunk. One experience entry = one chunk. Splitting a job description mid-requirements destroys the thing being retrieved.
- **Hybrid retrieval.** Resume and JD queries are keyword-dense ("Kubernetes", "SC-200"), where pure vector search underperforms. Pair it with Postgres `tsvector` and fuse with RRF.
- **Hard requirement: filter by `user_id` inside the SQL query, not after it.** Cross-user chunk leakage is the number-one failure mode of multi-tenant RAG, and here it would leak resumes.

**Privacy note**: Option B requires storing chunks *and* embeddings. Embeddings are not anonymization — source text is substantially recoverable from them. Adopting Option B means amending CLAUDE.md §5.2 with explicit opt-in, a visible delete control, and cascade deletes. That is a product decision, not a technical one.

---

## 3. Cross-Cutting Concerns

Things the chat route needs that no existing endpoint in this app has:

| Concern | Detail |
|---|---|
| **Streaming** | `generateContentStream` → `ReadableStream` from the route handler. Chat without streaming feels broken. |
| **Rate limiting** | Every existing endpoint is one-shot and self-limiting. Chat is unbounded — one user in a loop can run up the Gemini bill. Nothing rate-limits today. |
| **Prompt injection** | Job descriptions are scraped from LinkedIn, i.e. attacker-controllable text entering the model context. Fence them in delimiters and instruct the model to treat them strictly as data. |
| **Auth** | Same `auth.api.getSession` guard used by the other routes. |
| **`maxDuration`** | Needs tuning for streaming responses; check edge vs. node runtime behaviour. |
| **Information architecture** | Navbar has two links today. Four top-level items starts needing thought about grouping. |

---

## 4. Build Order

| # | Work | Effort |
|---|---|---|
| 1 | Extract shared `ResumeIntake` component from `JobMatcherClient` | ~2h |
| 2 | Layer 1 ATS checks + add `unpdf` + unit tests | 1 day |
| 3 | Layer 2 Gemini audit + scoring rubric + `/enhance` UI | 2 days |
| 4 | Context chat with streaming + tool-calling | 1–2 days |
| 5 | *(Deferred)* pgvector + knowledge base — only if a real corpus materialises | 4–5 days |

**Total for v1 (steps 1–4): roughly 4–5 days.**

---

## 5. Explicitly Out of Scope for v1

- Rewritten `.docx` / `.pdf` generation
- Vector database, embeddings, persistent chat history
- Storing resumes or audit results in Postgres
- Reranking models in the retrieval pipeline
- Fine-tuning or hosting any model (see §6–§9 for the track that leads there)

---

# Part II — Evaluation & Model Track

> The long-term goal is a continuously improving, domain-specific model rather than
> raw Gemini API calls. The two steps below are the only ones actionable today.
> Everything past them is gated on data volume that does not exist yet.

---

## 6. Continuous Evaluation Harness — **Step 1, do first**

### 6.1 Why this comes before everything

Today there is no way to answer *"did that prompt change make extraction better or worse?"* Every prompt edit and every Gemini version bump ships blind. The harness is:

- the **regression gate** for prompt and model changes (its value today)
- the **selection mechanism** for which Gemini variant to actually use
- the **filter** for distillation training data (§9)
- the **scoreboard** that makes any later training claim meaningful

It is worth building even if no model is ever trained. Days of work, near-zero running cost.

### 6.2 The golden set

100–200 resumes with hand-labelled expected output, plus a smaller set for `/url-extract` profiles.

**Rules that must not be broken:**

- **Never train on it.** Ever. Keep a separate training pool.
- **Never edit a label to match model output.** That is how an eval set quietly stops measuring anything.
- **Version it in git** alongside the code, so any historical eval result is reproducible.
- Store as `fixture.pdf` / `fixture.txt` + `expected.json` pairs.

Sourcing: anonymised real resumes where consent allows, plus synthetic ones generated to cover slices (§6.5). Synthetic-only is acceptable to start but will flatter the model — real documents are messier.

### 6.3 Three grader types

| Type | Used for | Cost | Stability |
|---|---|---|---|
| **Deterministic** | `ParsedResume` fields — skill-set precision/recall/F1, seniority accuracy, years-of-experience absolute error, contact-field exact match, valid-JSON rate | Free | Exact |
| **Verifier** | ATS checks from §1.1 Layer 1 — does the output actually parse, are required keywords covered, does every bullet carry a metric | Free | Exact |
| **LLM judge** | Only the genuinely subjective part: bullet rewrite quality, summary quality | Paid | Noisy — must be validated |

Most of what matters here is deterministic. `ParsedResume` is a structured schema, so field-level scoring covers the majority of the surface without a judge at all. Reach for the judge last, not first.

### 6.4 Validating the judge

An unvalidated LLM judge is a random number generator with good manners. Before trusting any judge metric:

- Hand-label ~50 examples for the dimension being judged
- Measure judge-vs-human agreement (Cohen's kappa; anything below ~0.6 means the judge is not usable as-is)
- Re-validate whenever the judge prompt or judge model changes
- Prefer **pairwise comparison** ("is A or B better?") over absolute 1–5 scoring — pairwise is markedly more stable, and it produces preference pairs usable later for DPO

### 6.5 Slices — never ship a single aggregate number

One overall score hides exactly the failures that matter. Report per slice:

- Fresh graduate / 2–5 years / 10+ years / career-gap / career-changer
- Academic CV (publications, multi-page) vs. industry one-pager
- Non-English names and transliterated names
- Multi-column and table-based layouts
- Scanned / image-only PDFs
- Very short (< 300 words) and very long (> 1500 words) documents

A model that gains two points overall while losing fifteen on scanned PDFs is a regression, and the aggregate will not tell you.

### 6.6 Track cost and latency as first-class metrics

Quality alone picks the wrong model. Every suite run records, per model:

- Quality scores per slice
- **Tokens in/out and cost per document**
- **p50 / p95 latency**
- Failure and retry rate

`src/lib/resume.ts` already falls through a `["gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-latest"]` chain with no evidence that the ordering is right. The harness answers that question with data, and that alone may pay for building it.

### 6.7 CI integration

- **Keep evals out of `npm test`.** Unit tests are fast, free, and deterministic; evals are slow, paid, and noisy. Mixing them makes CI cost money on every commit and produces flaky merge blocks.
- Separate command: `npm run eval`, plus per-suite variants.
- **Gate merges on deterministic and verifier graders only** — they are stable enough to block on.
- **Report judge-based metrics without gating** until kappa justifies otherwise.
- Commit run results to `evals/reports/` so quality is visible as a trend line, not a single snapshot.
- Record the **prompt hash and model version** with every run, or results cannot be attributed to a cause.

### 6.8 Proposed structure

```
evals/
├── datasets/
│   ├── golden-resumes/        # fixture.pdf + expected.json pairs
│   ├── golden-profiles/       # for /url-extract
│   └── slices.json            # slice membership definitions
├── graders/
│   ├── structured.ts          # field match, set F1, numeric error
│   ├── ats-verifier.ts        # reuses src/lib/resume-ats.ts
│   └── judge.ts               # pairwise LLM judge + kappa validation
├── suites/
│   ├── resume-parse.eval.ts
│   ├── resume-enhance.eval.ts
│   └── profile-extract.eval.ts
├── runner.ts                  # matrix runner: suites × models
└── reports/                   # committed JSON, one per run
```

---

## 7. Signal Instrumentation — **Step 2, gated on a privacy decision**

### 7.1 The conflict, stated plainly

§0 locks **stateless, nothing persisted**, and that is the right call for documents. But preference data is the only asset here that competitors cannot copy. Training algorithms are commodities — anyone can run DPO. **The proprietary signal is the moat.**

You cannot accumulate that signal while storing nothing. This decision has to be made deliberately now, not discovered later when the data is needed and eighteen months of it were thrown away.

### 7.2 The middle path — signal without the document

Store *what happened*, never *the document it happened to*:

- Log that variant B was chosen over variant A, keyed by a content hash — not the resume text
- Log that an apply link was clicked, keyed by job ID — not the candidate profile
- Log that a specific ATS issue category was marked fixed — not the resume it was fixed in
- Discard resume text at session end, exactly as today

This preserves the substance of the §5.2 guarantee while still yielding usable preference pairs. It is strictly less rich than full retention, and it is enough for DPO.

**Requirements if adopted:** explicit opt-in, a visible data control, a stated retention window, and an amendment to CLAUDE.md §5.2 describing precisely what is and is not kept.

### 7.3 Implicit beats explicit

Thumbs up/down is sparse, biased toward extremes, and mostly ignored. Behavioural signal is dense and honest:

| Signal | Strength | Source |
|---|---|---|
| Copied a rewritten bullet to clipboard | Strong positive | Enhancer UI |
| Kept original after seeing a rewrite | Weak negative | Enhancer UI |
| Clicked through `apply_url` | Strong positive on the match | Job card |
| Dismissed / skipped a job | Weak negative | Job card |
| Re-ran a search with edited keywords | The AI keywords were wrong | Job Matcher |
| Marked an ATS issue resolved | Issue was real and actionable | Enhancer |
| Edited a parsed field | Extraction was wrong — **highest-value correction signal** | Any intake |

That last row deserves emphasis: a user correcting a mis-parsed field hands you a labelled training example for free, at the exact point the model failed.

### 7.4 Log the counterfactual, or the data is unusable

Recording only what the user chose produces biased pairs. To build valid preference data you must also record **what else was shown and not chosen**, plus the variant assignment:

- Which variants were displayed, in what order
- Which prompt/model version produced each
- Position of each on screen (position bias is real and large)

Without this the pairs cannot be de-biased later, and the whole collection effort is wasted. It costs almost nothing to log at the outset and is impossible to reconstruct retroactively.

### 7.5 Minimal schema sketch

```
event {
  id, user_id, session_id, created_at
  event_type            # bullet_copied | apply_clicked | field_edited | ...
  surface               # enhance | jobs | url-extract
  variant_id            # which prompt/model version produced it
  shown_variants[]      # the counterfactual
  position              # for de-biasing
  payload jsonb         # hashes, category labels — never document text
}
```

---

## 8. Force Multipliers

Things that make the above materially more valuable for little extra effort.

### 8.1 Build the verifier suite once, use it three times

The deterministic ATS checks from §1.1 Layer 1 serve as:

1. A **product feature** (the enhancer's findings)
2. An **eval grader** (§6.3)
3. An **RLVR reward function** (§9)

This is real leverage and the strongest argument for building Layer 1 properly rather than leaning on the model. Design it as pure, side-effect-free functions with no coupling to the request path.

### 8.2 Outcome tracking — the signal nobody else has

Every ATS tool on the market optimises for a *proxy*: a score their own product invented. None of them know whether the user actually got an interview.

A single opt-in follow-up — *"did you hear back about any of these?"* at two and four weeks — produces ground truth against real hiring outcomes. It is sparse, slow, and suffers heavy response bias, so it will never be a dense training signal.

But it is the one thing that can validate the entire scoring rubric against reality, and it is the most genuinely defensible asset described in this document. **This, not the choice of training algorithm, is what "not in the market" actually means.**

### 8.3 Publish the benchmark

An open, documented ATS-parseability benchmark with published methodology costs little once §6 exists, and buys credibility, inbound interest, and a reason for others to contribute test cases. Competitors market with invented scores; a reproducible public benchmark is a different kind of claim.

### 8.4 A small labelling tool

The golden set needs maintenance, and judge disagreements need adjudication. A minimal internal page — show input, show output, capture the correct label — prevents the golden set from rotting. Without it, labelling happens in a spreadsheet, then stops happening.

### 8.5 Shadow mode

Run a candidate model or prompt against live traffic **without serving its output**, and score it offline against the production result. Gives real-distribution evidence before any user is exposed. The cleanest bridge between offline evals and production changes.

### 8.6 Cache eval runs by input hash

Eval runs cost money and get re-run constantly during development. Cache on `hash(input + prompt + model)`. Straightforward, and it removes the cost objection to running evals often — which is the behaviour you want.

---

## 9. Deferred — Model Training Track

Not actionable until §6 and §7 have been running long enough to produce volume. Recorded here so the sequencing stays visible.

| Technique | Verdict | Reasoning |
|---|---|---|
| **SFT** | **The real wedge** | Not a better general model — a small (4–8B) model that does resume → structured JSON as well as Flash at a fraction of cost and latency, because it does one thing. Distil from Flash outputs on real traffic, filtered by the §6 harness. |
| **CPT** | **Skip** | Needs billions of domain tokens that do not exist here, to teach a domain that is not linguistically alien. Worst effort-to-value ratio of the four. |
| **DPO** | Right idea, gated | Needs thousands of real preference pairs from §7. Months away, dependent on traffic. |
| **RLVR** | Genuinely applicable | Rare domain where reward is actually verifiable — run a real ATS parser on the output and check whether fields extract. The §8.1 verifier suite *is* the environment. |

**The reward-hacking caveat**, recorded now so it is not rediscovered later: optimise hard against a parser and the model learns to please the parser, not the recruiter. Keyword-stuffed output scores perfectly on every automated check and reads as spam to a human. Any RLVR run needs a human-preference term holding the line — which routes back through §7.

**Practical constraint:** none of SFT / DPO / RLVR is possible on the Gemini API. Vertex AI offers supervised tuning on Flash, but no preference or RL training. Anything past SFT means moving part of the pipeline to open weights (Qwen 3, Llama) and renting GPUs.

**Honest positioning note:** for a solo developer, competing on model training against funded teams is the hard version of this. The leverage is in the eval harness, the verifier suite, and the outcome data — all of which are worth building on their own merits, and none of which require training anything.
