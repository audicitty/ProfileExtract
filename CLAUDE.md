# ProfileExtract (profex) - Comprehensive Project Guide

> **Quick Context**: ProfileExtract is a full-stack Next.js 16 web application that provides AI-powered LinkedIn profile structuring, public URL profile scraping, and an intelligent Resume Scanner & LinkedIn Job Matcher tailored for tech talent with verified direct apply links and CSV exports.

---

## 1. Core Product Capabilities

The platform focuses on 2 core workflows:

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
  4. **Live LinkedIn Job Scraping**: Directly queries LinkedIn's official public guest search API (`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`) across all selected cities in parallel. The search endpoint returns title / company / location only.
  5. **Real Posting Requirements**: Results are cheaply pre-ranked on title/role overlap, then the top `DESCRIPTION_FETCH_LIMIT` (25) postings are fetched from LinkedIn's **per-job** guest endpoint (`jobs-guest/jobs/api/jobPosting/{id}`) — parallel with a concurrency cap of 6, a 9 s per-request timeout and a 20 s total budget. Bodies are stripped to plain text, scanned against a deterministic skill vocabulary, and cached in memory by job ID for 6 hours. A job whose fetch fails keeps title-inferred skills and is flagged `requirements_source: "inferred"` so the UI can distinguish real requirements from guesses.
  6. **100% Real Direct Links**:
     - `apply_url`: Direct `https://www.linkedin.com/jobs/view/{real_job_id}` link opening the exact active job posting on LinkedIn.
     - `company_apply_url`: Direct `https://www.linkedin.com/company/{company_slug}` verified organization profile.
  7. **Fit Scoring**: Deterministic, no model call. A weighted mean over the signals a job actually has evidence for — stated-skill overlap (60), title/target-role overlap (25), posting seniority vs. resume seniority (15) — scaled to the full 0–100 range. Skill comparison is token-boundary based, so "Java" never matches "JavaScript". Jobs with no usable requirements data are halved and reported as `match_confidence: "low"` rather than given a default ratio.
  8. **One-Click CSV Export**: Downloads all matched jobs with compensation, locations, apply links, and scores (`downloadJobsCsv`).

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
│   │   │   └── jobs/search/route.ts      # Live job search & fit scoring route
│   │   ├── dashboard/page.tsx            # Text Extractor workspace (auth-protected)
│   │   ├── url-extract/page.tsx          # URL Extractor workspace (auth-protected)
│   │   ├── jobs/page.tsx                 # AI Resume Scanner & Job Matcher (auth-protected)
│   │   ├── layout.tsx                    # Root layout with Navbar & Footer
│   │   ├── globals.css                   # Global styling
│   │   └── page.tsx                      # Landing page with feature highlights
│   ├── components/
│   │   ├── Navbar.tsx                    # Navigation with Text, URL, and Job Matcher links
│   │   ├── Footer.tsx                    # Site footer
│   │   ├── DashboardClient.tsx           # Text Extractor client UI
│   │   ├── UrlExtractClient.tsx          # URL Extractor client UI
│   │   ├── ProfileResults.tsx            # Structured profile view & CSV exporter
│   │   ├── JobMatcherClient.tsx          # Resume intake, multi-city filter, job cards & apply links
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
│       ├── jobs.ts                       # Live jobs scraper, posting-description fetch + TTL cache, skill vocabulary & fit scoring
│       ├── csv.ts                        # Candidate profile RFC 4180 CSV export
│       ├── jobs-csv.ts                   # Matched jobs RFC 4180 CSV export
│       └── brightdata.ts                 # Bright Data API client & profile normalizer
├── test/
│   ├── csv.test.mjs                      # Profile CSV unit tests
│   ├── brightdata.test.mjs               # Scraper normalization tests
│   └── jobs.test.mjs                     # Job search URL, token-boundary matching, scoring, cache & CSV tests (network mocked)
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
```

---

## 7. Known Issues / Tech Debt (Fix Later — Not Yet Actioned)

> Logged here for tracking only. Do not fix any of these until explicitly asked.

1. **Hardcoded Bright Data credentials committed to source.** [src/lib/brightdata.ts:280](src/lib/brightdata.ts#L280) — `extractProfileFromUrl` falls back to a literal API key (`f3fc32db-47d8-4117-81d7-b224ec63f965`) and dataset ID (`gd_l1viktl72bvl7bjuj0`) whenever `BRIGHTDATA_API_KEY` / `BRIGHTDATA_DATASET_ID` aren't set in the environment. `.env*` is gitignored, but this bypasses that entirely — the credential has been in the tracked file (and git history) since commit `2838457`. Fix: remove the fallback and throw if the env var is missing (same pattern already used for the Gemini key), and rotate the exposed key at Bright Data.
2. **Dead code left over from the Text Extractor removal.** Commit `7a57d3a` removed the Text Extractor feature from the UI/nav (dashboard now just redirects) but didn't delete its backend: `src/components/DashboardClient.tsx`, `src/app/api/extract/route.ts`, and `extractProfileData()` in `src/lib/gemini.ts` are unreferenced by any route. Fix: delete them, or restore the feature intentionally if it's coming back.
3. **This file is stale on the Text Extractor.** §1 and §3 above still document `/dashboard`, `DashboardClient.tsx`, and text extraction as a live capability — it isn't (see #2). Update once #2 is resolved.
4. **Frontend visual redesign planned.** See `FRONTEND_IMPROVEMENTS.md` (audit) and `REDESIGN_PROMPTS.md` (prompt sequence) at the repo root — appearance-only overhaul toward a 3D/glassmorphism aesthetic, to be executed prompt-by-prompt on request, without touching functionality.
5. ~~**Job match scoring is circular — the resume is scored against itself.**~~ **RESOLVED** (Phase 1) — the `candidateSkills` seeding is gone; `inferSkillsFromTitle(title)` no longer takes candidate skills at all, and nothing in the search or enrichment path reads the resume when building `skills_required`.
6. ~~**Job descriptions and required skills are fabricated, not scraped.**~~ **RESOLVED** (Phase 1) — the per-job guest endpoint was verified working (5/5 sequential and 16/16 concurrent probes returned HTTP 200, ~360–600 ms, no rate limiting) and is now the source of `description` and `skills_required`. The hardcoded `"Active job opening at…"` template is deleted; a failed fetch leaves `description: ""` rather than inventing one. `inferSkillsFromTitle` survives only as the named fallback, flagged via `requirements_source`. See §1 item 5 for the pipeline.
7. ~~**Match score is floored at 62 and skill matching collides on substrings.**~~ **RESOLVED** (Phase 1) — scoring is now a weighted mean over available signals across the full 0–100 range (a live 12-job sample moved from 90–99 / mean 97.6 to 29–57 / mean 45.4). Substring containment is replaced by `skillsAreEquivalent`, which canonicalizes through an alias table and compares on token boundaries; `Java`/`JavaScript` and `R`/`React` are regression-tested. Missing skills data yields `match_confidence: "low"` and a halved score instead of a 0.7 default ratio.
8. **Extracted requirements are unweighted, so long postings depress scores.** [src/lib/jobs.ts](src/lib/jobs.ts) — `extractSkillsFromText` treats every vocabulary hit as an equal requirement, capped at 14. A posting that mentions "Accessibility" once in a benefits paragraph weighs the same as React in the requirements list, so verbose postings score lower than terse ones for the same candidate. Scores are honest but compressed into roughly 30–60 in practice. Fix options, cheapest first: weight each skill by mention count (the counts are already computed), or segment the body and only harvest from the requirements/qualifications section. Anything semantic belongs in `idea.md` §7.3.
9. **The AI discovery fallback still fabricates entire job listings.** [src/lib/jobs.ts](src/lib/jobs.ts) — `discoverJobsWithAI` asks Gemini to invent 10–14 "highly realistic" postings with guessed company slugs and search-query `apply_url`s whenever the guest search returns fewer than 3 jobs. That contradicts §5 item 3 ("never generate fake job links") and the stated Phase 1 constraint against synthetic listings. It was left in place because removing a documented feature was outside the Phase 1 brief. Fix: delete it and return an empty result with an honest "LinkedIn returned no jobs" message.
10. **Salary is invented when LinkedIn omits it.** [src/lib/jobs.ts](src/lib/jobs.ts) — `estimateIndianSalary` fills `salary` with a hardcoded band (e.g. `"₹14 - ₹26 LPA"`) derived from the job title whenever the search card has no `job-search-card__salary-info`. The UI and CSV present it indistinguishably from real compensation data. Fix: leave `salary` undefined and let the UI say nothing.
11. **Only 4 jobs per city are collected, so `DESCRIPTION_FETCH_LIMIT` never binds.** [src/lib/jobs.ts](src/lib/jobs.ts) — `fetchLiveLinkedInGuestJobs` breaks at 4 results per location (max 5 locations = 20 jobs), always under the 25-posting fetch limit, and the guest search returns ~10 cards per city that are simply discarded. The description fetch is fast enough (12 postings in ~800 ms cold, 0 ms warm) to support a larger pool. Fix: raise the per-city cap and let the top-N ranking do the narrowing it was built for.
12. **`JobMatcherClient` defaults a missing `match_score` to 70.** [src/components/JobMatcherClient.tsx:843](src/components/JobMatcherClient.tsx#L843) — `const matchScore = job.match_score || 70;` invents a score for unscored jobs (searches run without a resume) and, because `0` is falsy, displays a genuine 0% match as 70%. The component also does not yet surface `match_confidence` or `requirements_source`, so inferred and low-confidence results look identical to verified ones. Out of Phase 1's scope (UI untouched by instruction). Fix: render "not scored" when `match_score` is undefined and label the confidence.
