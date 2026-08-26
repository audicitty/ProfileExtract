# ProfileExtract

A minimal, production-ready full-stack web application that allows users to paste raw visible text copied directly from any LinkedIn profile and converts it into clean, normalized structured data in an interactive table with a one-click client-side CSV export.

---

## Key Highlights

- **Stateless Extraction**: Zero database persistence for profile data. Submitted text and structured data live only in active memory.
- **Strict Schema Enforcement**: Powered by Google Gemini AI with strict `responseSchema` (structured JSON) to prevent hallucination — missing fields default to empty strings or empty arrays.
- **Client-Side RFC 4180 CSV Export**: Native JavaScript CSV generator with proper escaping for commas, double quotes, and multi-line descriptions.
- **Email + Password Authentication**: Secure authentication via [Better Auth](https://better-auth.com) and [Drizzle ORM](https://orm.drizzle.team) with PostgreSQL.
- **Free-Tier Compatible**: Runs completely on free-tier infrastructure (PostgreSQL via Neon / Supabase, Google Gemini API, Vercel Hobby tier).

---

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, TypeScript)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Auth**: [Better Auth](https://better-auth.com/) (Email + Password)
- **Database & ORM**: PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/)
- **AI Structuring**: [Google Gemini API](https://ai.google.dev/) (`gemini-2.5-flash` / `gemini-1.5-flash` with `responseSchema`)
- **CSV Export**: Native JavaScript (RFC-4180 compliant)

---

## Architecture & Data Flow

```
[User Browser]
       │
       ▼ (1. Paste visible LinkedIn profile text)
[Dashboard Workspace] ──(Client Validation >=100 chars)──► [Inline Error if invalid]
       │
       ▼ (2. POST /api/extract)
[Server-side API Route]
       ├──► 3. Server-side session verification (Better Auth / PostgreSQL)
       ├──► 4. Server-side input validation (non-empty, >=100 chars)
       └──► 5. Google Gemini API (schema-enforced, 15s timeout via AbortController)
       │
       ▼ (6. Return structured JSON payload — zero DB write)
[Structured Profile View]
       ├──► Interactive cards (Overview, Experience, Education, Projects, Certs, Skills)
       └──► 7. One-Click Native CSV Export (Browser Blob download)
```

---

## Fixed Profile Extraction Schema

```json
{
  "first_name": "string",
  "last_name": "string",
  "headline": "string",
  "current_company": "string",
  "current_title": "string",
  "location": "string",
  "about": "string",
  "education": [
    {
      "school": "string",
      "degree": "string",
      "years": "string"
    }
  ],
  "experience": [
    {
      "company": "string",
      "title": "string",
      "duration": "string",
      "description": "string"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string"
    }
  ],
  "skills": ["string"]
}
```

---

## Environment Variables

Create a `.env.local` file in the root directory:

```env
# PostgreSQL connection string (Neon / Supabase / Local PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/profileextract"

# Better Auth Secret (minimum 32 characters)
BETTER_AUTH_SECRET="your_secure_random_secret_at_least_32_chars_long"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Google Gemini API Key
GOOGLE_GENERATIVE_AI_API_KEY="your_gemini_api_key_here"
```

---

## Quickstart & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Push Database Schema
```bash
npm run db:push
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Run Tests & Build
```bash
# Run unit tests (CSV generation & RFC-4180 escaping)
npm test

# Run linter
npm run lint

# Run production build
npm run build
```

---

## License

MIT License.
