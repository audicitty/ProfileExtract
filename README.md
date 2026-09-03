# ProfileExtract (profex)

A full-stack, production-ready AI career intelligence platform built with **Next.js 16**, **Google Gemini AI**, **Bright Data**, and **Better Auth**.

---

## Two Core Features

### 1. LinkedIn URL Profile Extractor (`/url-extract`)
- Provide any public LinkedIn profile URL (e.g. `https://www.linkedin.com/in/username`).
- Scrapes live profile data via Bright Data Scraper API (`gd_l1viktl72bvl7bjuj0`).
- Normalizes data and enriches missing technical/domain skills using Gemini AI.
- One-click RFC 4180 client-side CSV download.

### 2. AI Resume Scanner & LinkedIn Job Matcher (`/jobs`)
- Upload a **PDF resume** or paste resume text.
- Gemini AI scans qualifications, seniority level, core tech stack, and target career trajectory roles.
- **Indian IT Hubs Multi-Location Filtering**:
  - Multi-select across **Bangalore**, **Gurgaon**, **Delhi / NCR**, **Noida**, **Chennai**, **Jaipur**, **Indore**, **Hyderabad**, **Pune**, **Mumbai**, and **Remote (India)**.
- **Real-Time Live LinkedIn Job Scraping**:
  - Directly queries LinkedIn's official public jobs search API across selected cities.
  - **100% Real Direct Links**:
    - `Apply on LinkedIn`: Direct `/jobs/view/{id}` link opening the exact active job posting.
    - `Company Profile`: Direct verified LinkedIn organization page (`/company/{slug}`).
- **AI Fit Match Score (0–100%)**: Calculates skill alignment, strengths breakdown, and missing skills to brush up on.
- **Job CSV Export**: One-click download of all matched opportunities with salaries, apply links, and match scores.

---

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack, TypeScript 5)
- **UI Library**: React 19, Tailwind CSS v4, Lucide React
- **Authentication**: [Better Auth](https://better-auth.com/) (Email + Password sessions)
- **Database & ORM**: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/)
- **AI Models**: [Google Gemini API](https://ai.google.dev/) (`gemini-2.5-flash` with `responseSchema`)
- **Live Job Scraping**: LinkedIn public guest search endpoint
- **Profile Web Scraping**: Bright Data Dataset API
- **Testing**: Node test runner via `tsx`

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment Variables
Create a `.env.local` file:
```env
# Database (PostgreSQL - Neon / Supabase / Local)
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# Better Auth Secret (minimum 32 characters)
BETTER_AUTH_SECRET="your_32_character_secret_key"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Google Gemini API Key
GOOGLE_GENERATIVE_AI_API_KEY="your_gemini_api_key"

# Bright Data API (Optional for profile URL scraping)
BRIGHTDATA_API_KEY="your_brightdata_key"
BRIGHTDATA_DATASET_ID="gd_l1viktl72bvl7bjuj0"
```

### 3. Push Database Schema
```bash
npm run db:push
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Run Tests & Production Build
```bash
npm test
npm run build
```

---

## Documentation for Agents & Developers
For full architectural details, schemas, and implementation guides, see [`CLAUDE.md`](./CLAUDE.md).

---

## License
MIT License.
