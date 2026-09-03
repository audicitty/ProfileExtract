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
  4. **Live LinkedIn Job Scraping**: Directly queries LinkedIn's official public guest search API (`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search`) across all selected cities in parallel.
  5. **100% Real Direct Links**:
     - `apply_url`: Direct `https://www.linkedin.com/jobs/view/{real_job_id}` link opening the exact active job posting on LinkedIn.
     - `company_apply_url`: Direct `https://www.linkedin.com/company/{company_slug}` verified organization profile.
  6. **AI Fit Scoring**: Compares candidate's skills against each job's requirements to calculate a 0–100% match score, highlighting matched strengths and missing skill gaps.
  7. **One-Click CSV Export**: Downloads all matched jobs with compensation, locations, apply links, and scores (`downloadJobsCsv`).

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
│       ├── jobs.ts                       # Live LinkedIn jobs scraper, URL generator, AI fallback & match scoring
│       ├── csv.ts                        # Candidate profile RFC 4180 CSV export
│       ├── jobs-csv.ts                   # Matched jobs RFC 4180 CSV export
│       └── brightdata.ts                 # Bright Data API client & profile normalizer
├── test/
│   ├── csv.test.mjs                      # Profile CSV unit tests
│   ├── brightdata.test.mjs               # Scraper normalization tests
│   └── jobs.test.mjs                     # Job search URL, scoring & CSV tests
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
