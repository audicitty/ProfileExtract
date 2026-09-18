# ProfileExtract (profex) - Comprehensive Project Guide

> **Quick Context**: ProfileExtract is a full-stack Next.js 16 web application that provides AI-powered LinkedIn profile structuring, public URL profile scraping, and an intelligent Resume Scanner & LinkedIn Job Matcher tailored for tech talent with verified direct apply links and CSV exports.

---

## 1. Core Product Capabilities

The platform focuses on 3 core workflows:

### 1. LinkedIn URL Profile Extractor (`/url-extract`)
- **Route**: `src/app/url-extract/page.tsx` | Component: `src/components/UrlExtractClient.tsx`
- **Backend**: `src/app/api/extract-url/route.ts` & `src/lib/brightdata.ts`
- **Function**: Users submit any public LinkedIn profile URL (e.g. `https://www.linkedin.com/in/username`).
- **Scraper**: Triggers Bright Data scraper API (`gd_l1viktl72bvl7bjuj0`), polls snapshot progress, and normalizes fields with automated Gemini AI skill enrichment.
- **Export**: Generates RFC 4180 flat single-row CSV ready for Excel, Google Sheets, or CRM databases (`src/lib/csv.ts`).

### 2. AI Resume Scanner & LinkedIn Job Matcher (`/jobs`)
- **Route**: `src/app/jobs/page.tsx` | Component: `src/components/JobMatcherClient.tsx`
- **Backend**: 
  - Resume parser: `src/app/api/resume/scan/route.ts` & `src/lib/resume.ts`
  - Job discovery & scoring: `src/app/api/jobs/search/route.ts` & `src/lib/jobs.ts`
  - CSV generator: `src/lib/jobs-csv.ts`
- **Function**:
  1. Ingests candidate resumes via **pasted text** or **native PDF file upload** (base64).
  2. Gemini extracts skills, seniority level, years of experience, and target roles.
  3. **Multi-Location Filtering**: Users can select one or more major Indian IT hubs simultaneously:
     - **Bangalore (Bengaluru)**, **Gurgaon (Gurugram)**, **Delhi / NCR**, **Noida**, **Chennai**, **Jaipur**, **Indore**, **Hyderabad**, **Pune**, **Mumbai**, and **Remote (India)**, or custom cities.
  4. **Live LinkedIn Job Scraping**: Directly queries LinkedIn's official public guest search API (`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`) across all selected cities in parallel.
     - **Real requirements**: that search endpoint returns only title/company/location, so for the top 25 results the pipeline also fetches each posting's actual body from the per-job guest endpoint (`jobs-guest/jobs/api/jobPosting/{id}`), strips it to plain text, and parses `skills_required` from the real text (`src/lib/job-descriptions.ts`).
     - **Caching & pacing**: bodies are cached by job ID for 6 hours. The guest API shares one burst limiter across search and per-job calls, so fetches run at concurrency 2 with a 400ms gap and a single 429 retry, under an overall time budget.
     - **Per-job fallback**: a failed fetch falls back to title-inferred skills for that listing alone, marked `skills_source: "inferred"`. Nothing invents requirements text.
  5. **100% Real Direct Links**:
     - `apply_url`: Direct `https://www.linkedin.com/jobs/view/{real_job_id}` link opening the exact active job posting on LinkedIn.
     - `company_apply_url`: Direct `https://www.linkedin.com/company/{company_slug}` verified organization profile.
  6. **Fit Scoring**: Compares the candidate's skills against each job's requirements on token boundaries to calculate a match score across the full 0–100 range, highlighting matched strengths and missing skill gaps. Each listing also carries `match_confidence` (`high` = scored against the real posting, `medium` = title-inferred skills, `low` = no skills data). Deterministic string matching — no model call is involved in scoring.
  7. **One-Click CSV Export**: Downloads all matched jobs with compensation, locations, apply links, and scores (`downloadJobsCsv`).
  8. **"Optimize for this job"**: each job card hands that posting's real description to the Resume Enhancer through `sessionStorage` (`src/lib/resume-enhance-target.ts`) and navigates to `/enhance` for targeted keyword-gap analysis.

### 3. Resume Enhancer & ATS Audit (`/enhance`)
- **Route**: `src/app/enhance/page.tsx` | Component: `src/components/ResumeEnhancerClient.tsx`
- **Backend**: `src/app/api/resume/enhance/route.ts`, `src/lib/pdf-structure.ts`, `src/lib/resume-ats.ts`, `src/lib/resume-enhance.ts`
- **Function**: two layers with a hard split (idea.md §1.1), and the split is the point:
  1. **Structural layer (measured)**: an uploaded PDF is reduced to positioned text (`unpdf`), and the bench-derived checks in `checks/registry.json` run over it. The score and sub-scores are assembled in TypeScript from measured severities — no model is involved. Pasted text has no layout, so it gets no structure score rather than a made-up one.
  2. **Content layer (judgement)**: a short, schema-enforced Gemini prompt covers only weak/passive verbs, unquantified bullets, buzzword padding, tense drift, summary strength, and where a missing target-JD keyword could go. It returns findings and booleans, never a score.
  3. **Keyword gaps are deterministic**: skills named in the target job description are token-boundary matched against the resume text (same matcher as the job pipeline). The model only proposes placements.
  4. **Output**: score with sub-scores, issues grouped by severity, copyable rewritten bullets and summary, and a plain-text ATS-safe re-flow of the resume. No `.docx`/`.pdf` generation (idea.md §1.6).
- **Intake**: shares `src/components/ResumeIntake.tsx` with the Job Matcher — one copy of the paste/PDF-base64 logic.

---

## 2. Technology Stack & Frameworks

| Layer | Technologies & Versions |
|---|---|
| **Framework** | **Next.js 16.3.3** (App Router, Turbopack, TypeScript 5) |
| **UI Library** | **React 19.2.8** |
| **Styling** | **Tailwind CSS v4** (`@tailwindcss/postcss`) |
| **Icons** | **Lucide React** (`lucide-react`) |
| **Authentication** | **Better Auth 1.7.1** (Email + Password session auth) |
| **Database & ORM** | **PostgreSQL** via **Drizzle ORM 0.45.2** (`drizzle-kit 0.31.10`, `pg 8.23.0`) |
| **AI Models** | **Google Gemini API** (`@google/generative-ai` & `@google/genai`) using `gemini-2.5-flash` |
| **Live Job Scraping** | LinkedIn public guest jobs search endpoint (`jobs-guest/jobs/api/seeMoreJobPostings/search`) |
| **Profile Web Scraper** | Bright Data Dataset API (`api.brightdata.com/datasets/v3`) |
| **Testing** | Node test runner via `tsx` (`test/**/*.test.mjs`) |

---

## 3. Directory Structure & Key Files

```
profex/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx            # Login page (Better Auth)
│   │   │   └── signup/page.tsx           # Signup page (Better Auth)
│   │   ├── api/
│   │   │   ├── auth/[...all]/route.ts    # Better Auth route handler
│   │   │   ├── extract/route.ts          # AI Profile Text extractor route
│   │   │   ├── extract-url/route.ts      # Bright Data profile URL scraper route
│   │   │   ├── resume/scan/route.ts      # AI Resume scanner route (text & PDF)
│   │   │   ├── resume/enhance/route.ts   # ATS structural audit + content review route
│   │   │   └── jobs/search/route.ts      # Live job search & fit scoring route
│   │   ├── dashboard/page.tsx            # Text Extractor workspace (auth-protected)
│   │   ├── url-extract/page.tsx          # URL Extractor workspace (auth-protected)
│   │   ├── jobs/page.tsx                 # AI Resume Scanner & Job Matcher (auth-protected)
│   │   ├── enhance/page.tsx              # Resume Enhancer & ATS audit (auth-protected)
│   │   ├── layout.tsx                    # Root layout with Navbar & Footer
│   │   ├── globals.css                   # Global styling
│   │   └── page.tsx                      # Landing page with feature highlights
│   ├── components/
│   │   ├── Navbar.tsx                    # Navigation with URL Extractor, Resume Enhancer & Job Matcher links
│   │   ├── Footer.tsx                    # Site footer
│   │   ├── DashboardClient.tsx           # Text Extractor client UI
│   │   ├── UrlExtractClient.tsx          # URL Extractor client UI
│   │   ├── ProfileResults.tsx            # Structured profile view & CSV exporter
│   │   ├── JobMatcherClient.tsx          # Multi-city filter, job cards, apply links & "Optimize for this job"
│   │   ├── ResumeIntake.tsx              # Shared paste / PDF-base64 intake (Job Matcher + Enhancer)
│   │   ├── ResumeEnhancerClient.tsx      # Scores, issues by severity, copyable rewrites, ATS-safe text
│   │   └── LoadingSkeleton.tsx           # Loading state skeletons
│   ├── db/
│   │   ├── schema.ts                     # Drizzle schema (users, sessions, accounts, verifications)
│   │   ├── index.ts                      # PostgreSQL pool connection
│   │   └── init.ts                       # Database initial migration script
│   └── lib/
│       ├── types.ts                      # All TypeScript interfaces (ProfileData, ParsedResume, JobListing, etc.)
│       ├── auth.ts                       # Better Auth server configuration
│       ├── auth-client.ts                # Better Auth client hooks (useSession, signOut)
│       ├── gemini.ts                     # Strict schema-enforced profile extraction
│       ├── resume.ts                     # Gemini-powered resume analyzer (text & multimodal PDF)
│       ├── pdf-structure.ts              # PDF -> positioned text items (unpdf), no interpretation
│       ├── resume-ats.ts                 # Bench-derived structural checks & TS score assembly
│       ├── resume-enhance.ts             # LLM content layer, keyword gaps, ATS-safe text
│       ├── resume-enhance-target.ts      # Job card -> /enhance handoff (sessionStorage)
│       ├── jobs.ts                       # Live LinkedIn jobs scraper, URL generator, AI fallback & match scoring
│       ├── job-descriptions.ts           # Per-job posting fetch, TTL cache, HTML→text, skill parsing
│       ├── csv.ts                        # Candidate profile RFC 4180 CSV export
│       ├── jobs-csv.ts                   # Matched jobs RFC 4180 CSV export
│       └── brightdata.ts                 # Bright Data API client & profile normalizer
├── test/
│   ├── csv.test.mjs                      # Profile CSV unit tests
│   ├── brightdata.test.mjs               # Scraper normalization tests
│   ├── jobs.test.mjs                     # Job search URL, token matching, scoring, description cache & CSV tests
│   ├── resume-ats.test.mjs               # Structural checks, score assembly & PDF extraction tests
│   ├── resume-enhance.test.mjs           # Prompt budget guard, keyword gaps, sections & ATS-safe text
│   ├── checks-registry.test.mjs          # Registry is generated, not hand-written (severity drift guard)
│   └── evals-graders.test.mjs            # Regression-set graders & fixture labels (free, deterministic)
├── bench/                                # DEV TOOL ONLY — parser bench (see §8). Not in src/, not bundled.
│   ├── content.json                      # One resume's content, held constant across fixtures
│   ├── fixtures.mjs                      # 13 fixtures, each varying exactly one dimension
│   ├── render-html.mjs                   # Content + render options -> fixture HTML + expected values
│   ├── build-fixtures.mjs                # Headless Chrome -> fixture PDFs + manifests
│   ├── run.mjs                           # fixture x parser -> accuracy matrix + severity
│   ├── score.mjs                         # Per-field probes for each oracle
│   ├── analyze-layout.mjs                # Reading-order ambiguity measured on the PDFs themselves
│   ├── build-registry.mjs                # Emits checks/registry.{yaml,json} from measurements
│   ├── parsers/                          # Oracle A (vendored open-resume, AGPL) & oracle B (pyresparser)
│   └── results/                          # Committed evidence: matrix, severity, layout
├── checks/
│   ├── checks.mjs                        # Check statements, layers, assertions (no severities)
│   └── registry.yaml / registry.json     # Generated registry with bench-measured severities
├── evals/                                # Regression check set (see §9). Run by hand, not in npm test.
│   ├── README.md                         # The two rules, labelling conventions, fixture checklist
│   ├── run.mjs                           # `npm run check` — pipeline -> graders -> baseline
│   ├── graders.mjs                       # Deterministic graders only (no LLM judge)
│   ├── fixtures.mjs                      # Fixture discovery & label validation
│   ├── build-example-pdfs.mjs            # Renders the example resume.txt files to PDF (Chrome)
│   ├── fixtures/example-*/               # 5 EXAMPLE fixtures (invented, not coverage)
│   └── baseline/baseline.{json,md}       # Committed baseline; `git diff` it after a prompt change
├── .env.local                            # Local environment variables
├── drizzle.config.ts                     # Drizzle ORM config
├── package.json                          # Dependencies and scripts
└── README.md                             # Repository overview
```

---

## 4. Environment Variables (`.env.local`)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase / Neon / Local) | `postgresql://user:pass@host:5432/db` |
| `BETTER_AUTH_SECRET` | Secret key for Better Auth (minimum 32 chars) | `your_32_char_secret` |
| `NEXT_PUBLIC_APP_URL` | Base application URL | `http://localhost:3000` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Gemini API Key | `AIzaSy...` |
| `BRIGHTDATA_API_KEY` | Bright Data API token for LinkedIn scraping | `f3fc32db-...` |
| `BRIGHTDATA_DATASET_ID` | Bright Data Person Profile dataset ID | `gd_l1viktl72bvl7bjuj0` |

---

## 5. Critical Implementation Details

1. **Next.js 16 Breaking Conventions**:
   - `headers()` in server components/route handlers is asynchronous: `await headers()`.
   - `searchParams` and `params` in pages are asynchronous `Promise` objects in Next.js 16.
2. **Stateless Candidate Profile Privacy**:
   - Extracted profiles and uploaded resumes are **never** persisted in the PostgreSQL database.
   - Database only stores user authentication credentials and session tokens (`user`, `session`, `account`, `verification`).
3. **LinkedIn Job Links**:
   - Never generate fake random numbers for job links (they collide with random expired jobs globally).
   - Always query LinkedIn's live public guest jobs endpoint (`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`) which provides genuine URNs (`/jobs/view/{id}`) and verified company profile links (`/company/{slug}`).
4. **Indian IT Hubs Multi-Location Support**:
   - Supported cities: `Bangalore`, `Gurgaon`, `Delhi / NCR`, `Noida`, `Chennai`, `Jaipur`, `Indore`, `Hyderabad`, `Pune`, `Mumbai`, `Remote (India)`.
   - `filters.locations` accepts an array of strings, enabling users to search across multiple cities simultaneously.
5. **CSV RFC 4180 Compliance**:
   - All cell values containing commas, quotes, or newlines are wrapped in quotes with internal quotes doubled (`""`).
   - UTF-8 Byte Order Mark (`\uFEFF`) is prepended so Excel and international spreadsheet viewers display text and currency symbols (₹, $, €) accurately.

---

## 6. Common Developer Commands

```bash
# 1. Run local dev server (Turbopack)
npm run dev

# 2. Run unit tests
npm test

# 3. Run production build & type check
npm run build

# 4. Push database schema migrations
npm run db:push

# 5. Run linter
npm run lint

# 6. Regression check set (paid, manual — see §9). Deliberately NOT part of npm test.
npm run check                      # all fixtures: pipeline + graders, rewrites the baseline
npm run check -- --structure-only  # free: resume-ats.ts structural grader only
npm run check -- 03 --no-write     # one fixture, leave the committed baseline alone

# 7. Parser bench (development tool — see §8)
npm run bench:setup      # once: creates bench/.venv, installs oracle B + PyMuPDF
npm run bench:fixtures   # render the 13 fixture PDFs
npm run bench            # fixture x parser matrix -> bench/results/
npm run bench:registry   # regenerate checks/registry.{yaml,json}
```

---

## 7. Known Issues / Tech Debt (Fix Later — Not Yet Actioned)

> Logged here for tracking only. Do not fix any of these until explicitly asked.

1. **Hardcoded Bright Data credentials committed to source.** [src/lib/brightdata.ts:280](src/lib/brightdata.ts#L280) — `extractProfileFromUrl` falls back to a literal API key (`f3fc32db-47d8-4117-81d7-b224ec63f965`) and dataset ID (`gd_l1viktl72bvl7bjuj0`) whenever `BRIGHTDATA_API_KEY` / `BRIGHTDATA_DATASET_ID` aren't set in the environment. `.env*` is gitignored, but this bypasses that entirely — the credential has been in the tracked file (and git history) since commit `2838457`. Fix: remove the fallback and throw if the env var is missing (same pattern already used for the Gemini key), and rotate the exposed key at Bright Data.
2. **Dead code left over from the Text Extractor removal.** Commit `7a57d3a` removed the Text Extractor feature from the UI/nav (dashboard now just redirects) but didn't delete its backend: `src/components/DashboardClient.tsx`, `src/app/api/extract/route.ts`, and `extractProfileData()` in `src/lib/gemini.ts` are unreferenced by any route. Fix: delete them, or restore the feature intentionally if it's coming back.
3. **This file is stale on the Text Extractor.** §1 and §3 above still document `/dashboard`, `DashboardClient.tsx`, and text extraction as a live capability — it isn't (see #2). Update once #2 is resolved.
4. **Frontend visual redesign planned.** See `FRONTEND_IMPROVEMENTS.md` (audit) and `REDESIGN_PROMPTS.md` (prompt sequence) at the repo root — appearance-only overhaul toward a 3D/glassmorphism aesthetic, to be executed prompt-by-prompt on request, without touching functionality.
5. ~~**Job match scoring is circular — the resume is scored against itself.**~~ **Resolved.** `inferSkillsFromTitle` no longer accepts or seeds candidate skills, so no job is constructed to require skills the candidate has. Covered by the "inferred skills never include the candidate's own skills" test.
6. ~~**Job descriptions and required skills are fabricated, not scraped.**~~ **Resolved.** The per-job guest endpoint (`jobs-guest/jobs/api/jobPosting/{id}`) was verified working (25/25 at concurrency 2) and is now fetched for the top 25 results, with a 6-hour cache in `src/lib/job-descriptions.ts`. `skills_required` is parsed from the real posting text; `inferSkillsFromTitle` remains as the per-job fallback only, flagged via `skills_source`.
7. ~~**Match score is floored at 62 and skill matching collides on substrings.**~~ **Resolved.** Scoring is now `skillRatio * 80 + (roleMatch ? 20 : 0)` across the full 0–100 range; missing skills data uses a low `UNKNOWN_SKILL_RATIO` (0.25) plus `match_confidence: "low"` instead of the old 0.7 default. Substring containment was replaced with token-boundary matching, so "Java" no longer matches "JavaScript" and "R" no longer matches "React".
8. **The UI floors a zero match score at 70.** [src/components/JobMatcherClient.tsx:843](src/components/JobMatcherClient.tsx#L843) — `const matchScore = job.match_score || 70;` means a legitimately-computed score of `0` renders as `70`, because `0` is falsy. This predates the scoring fix but only became reachable now that scores can be 0. It hides exactly the poor-fit jobs the new scoring correctly rejects. Fix: use `job.match_score ?? 70`, or drop the fallback. Also unused: `match_confidence` and `skills_source` are populated but not yet surfaced anywhere in the UI.
9. **The AI discovery fallback still fabricates entire job listings.** [src/lib/jobs.ts](src/lib/jobs.ts) — `discoverJobsWithAI` runs whenever the live guest search returns fewer than 3 jobs, and asks Gemini to invent 10–14 "highly realistic" listings with constructed `apply_url` and `company_apply_url` values. That conflicts with the §5.3 rule against fabricated job links and with `IMPLEMENTATION_PLAN.md` §0.3. Its output is now marked `skills_source: "inferred"`, but the listings themselves are still synthetic. Decide whether to delete the fallback and show an empty state instead.
10. **`estimateIndianSalary` invents compensation.** [src/lib/jobs.ts](src/lib/jobs.ts) — when a posting has no salary field, the listing is given a made-up band (e.g. `"₹14 - ₹26 LPA"`) derived from the title, presented to the user and exported to CSV as if it came from the posting. Most LinkedIn postings have no salary, so this is the common path, not the edge case. Fix: show "Not disclosed" rather than a guess.

---

## 8. ATS Check Registry & Parser Bench

`checks/registry.yaml` is the source of truth for what the Resume Enhancer checks and how
much each issue is worth. **Every `severity_points` value is measured, not chosen**: it is
the drop in field-extraction accuracy that formatting choice caused across two open-source
resume parsers, versus a baseline fixture with identical content. See `bench/README.md`
for the method and `bench/results/severity.md` for the table.

Rules that hold from here on:

1. **Never hand-edit `checks/registry.yaml` or `registry.json`.** They are generated by
   `npm run bench:registry`; `test/checks-registry.test.mjs` fails if they drift. Statements
   and assertions live in `checks/checks.mjs`; severities come only from a bench run.
2. **Never invent a severity.** A check with no fixture carries `severity_points: null` and
   a `severity_status` of `placeholder-untested` or `not-bench-measurable`. Content checks
   (weak verbs, unquantified bullets) are the LLM layer and have no bench weight by design.
3. **`confidence: single-parser` means low confidence** — only one oracle flagged it. Do not
   present those to a user as established fact.
4. **Entries carrying a `caveat` are not settled.** Both oracles read in flow order, so the
   two-column and sidebar checks show no measured drop even though `bench/results/layout.json`
   shows the reading order is genuinely ambiguous. That gap is stated, not papered over.
5. **The bench stays out of the product.** `bench/` is excluded from `tsconfig.json` and
   ESLint, is never imported from `src/`, and never runs in a request. Its Python venv
   (`bench/.venv/`) and generated PDFs (`bench/out/`) are gitignored.

---

## 9. Regression Check Set (`evals/`)

A safety net for prompt changes, not an eval harness (idea.md §6). `npm run check` feeds
~15–20 resume fixtures through the real pipeline, grades the result with deterministic
graders, and rewrites the committed baseline in `evals/baseline/`. The workflow is: change
a prompt, run it, read `git diff evals/baseline/`.

Rules that hold from here on:

1. **Never train on the fixtures, and never edit a label to match model output.** These two
   rules are the whole value of the set; `evals/README.md` states them first for that
   reason. Loosening a grader or adding a `SKILL_ALIASES` entry so a wrong answer counts as
   right is rule 2 with extra steps.
2. **`npm run check` stays out of `npm test`.** It is slow and it costs money on every run,
   and it must never gate an ordinary commit. The graders themselves are pure and free, so
   `test/evals-graders.test.mjs` does belong in `npm test`.
3. **Deterministic graders only — no LLM judge.** `ParsedResume` is structured enough that
   set precision/recall, exact match and absolute error cover what matters. `summary`,
   `target_roles` and `suggested_search_keywords` are free text and are not graded at all.
4. **The structural grader is `auditResumeStructure()` from `src/lib/resume-ats.ts`** —
   built in Phase 3, reused here, not reimplemented. It has no model in it, so the
   comparison against each fixture's pinned `structure` block is exact: drift means
   `resume-ats.ts`, `pdf-structure.ts` or `checks/registry.json` changed.
5. **The set observes the pipeline; it never changes it.** Nothing under `evals/` is
   imported from `src/`, and no run writes to `src/`.
6. **The five `example-*` fixtures are invented and are not coverage.** They exist so the
   format is unambiguous and the runner is provable end to end. The runner counts "real"
   and "example" separately and nags while the real count is under 15. The checklist of
   fixtures still to supply is at the end of `evals/README.md`.
