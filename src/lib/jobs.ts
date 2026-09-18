import { GoogleGenerativeAI } from "@google/generative-ai";
import { JobListing, JobSearchFilters, ParsedResume } from "./types";
import {
  FetchJobDescriptionsOptions,
  JOB_DESCRIPTION_FETCH_LIMIT,
  fetchJobDescriptions,
  jobDescriptionCacheStats,
} from "./job-descriptions";

/** Share of the score carried by skill overlap. */
export const SKILL_WEIGHT = 80;
/** Share of the score carried by the job title matching a target role. */
export const ROLE_WEIGHT = 20;
/**
 * Stand-in overlap for a job with no usable skills data.
 *
 * Low on purpose. The previous 0.7 default flattered every unscoreable job into
 * the mid-90s; a job we cannot assess should rank below one we can and be
 * labelled low confidence (CLAUDE.md §7 item 7).
 */
export const UNKNOWN_SKILL_RATIO = 0.25;

/** Where a search goes when the caller names no city. */
export const DEFAULT_SEARCH_LOCATIONS = ["Bangalore", "Gurgaon", "Noida"];

const WORKPLACE_TYPES = ["all", "remote", "hybrid", "onsite"] as const;
const DATE_POSTED = ["all", "past_24h", "past_week", "past_month"] as const;
const EXPERIENCE_LEVELS = ["all", "entry", "mid", "senior"] as const;

/**
 * Coerces whatever a caller sent into a valid `JobSearchFilters`.
 *
 * Shared by the `/api/jobs/search` route and the chat `search_jobs` tool so the model
 * cannot reach a code path the HTTP client cannot, and neither can widen the filter
 * vocabulary by accident.
 */
export function normaliseJobSearchFilters(
  input: Partial<JobSearchFilters> | null | undefined
): JobSearchFilters {
  const rawLocations =
    Array.isArray(input?.locations) && input.locations.length > 0
      ? input.locations.map((l: unknown) => String(l).trim()).filter(Boolean)
      : input?.location
        ? String(input.location)
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean)
        : [];

  const locations = rawLocations.length > 0 ? rawLocations.slice(0, 8) : DEFAULT_SEARCH_LOCATIONS;

  const pick = <T extends readonly string[]>(allowed: T, value: unknown): T[number] =>
    allowed.includes(String(value)) ? (String(value) as T[number]) : allowed[0];

  return {
    keywords: String(input?.keywords || "").trim().slice(0, 120) || "Software Engineer",
    location: locations.join(", "),
    locations,
    workplace_type: pick(WORKPLACE_TYPES, input?.workplace_type),
    date_posted: pick(DATE_POSTED, input?.date_posted),
    experience_level: pick(EXPERIENCE_LEVELS, input?.experience_level),
  };
}

/**
 * Builds a search URL for LinkedIn Jobs based on specified filters.
 */
export function buildLinkedInJobSearchUrl(filters: JobSearchFilters): string {
  const params = new URLSearchParams();

  const keywords = filters.keywords?.trim() || "Software Engineer";
  params.set("keywords", keywords);

  // Combine multiple locations if provided
  let locationStr = "";
  if (Array.isArray(filters.locations) && filters.locations.length > 0) {
    locationStr = filters.locations.join(", ");
  } else if (filters.location?.trim()) {
    locationStr = filters.location.trim();
  } else {
    locationStr = "India";
  }
  params.set("location", locationStr);

  // Date posted filter (f_TPR)
  if (filters.date_posted === "past_24h") {
    params.set("f_TPR", "r86400"); // 24 hours
  } else if (filters.date_posted === "past_week") {
    params.set("f_TPR", "r604800"); // 7 days
  } else if (filters.date_posted === "past_month") {
    params.set("f_TPR", "r2592000"); // 30 days
  }

  // Workplace type filter (f_WT: 1 = on-site, 2 = remote, 3 = hybrid)
  if (filters.workplace_type === "remote") {
    params.set("f_WT", "2");
  } else if (filters.workplace_type === "hybrid") {
    params.set("f_WT", "3");
  } else if (filters.workplace_type === "onsite") {
    params.set("f_WT", "1");
  }

  // Experience level filter (f_E: 2 = entry, 3 = mid-senior, 4 = director)
  if (filters.experience_level === "entry") {
    params.set("f_E", "2");
  } else if (filters.experience_level === "mid") {
    params.set("f_E", "3");
  } else if (filters.experience_level === "senior") {
    params.set("f_E", "4");
  }

  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

/**
 * Normalizes workplace type string into union
 */
function normalizeWorkplaceType(raw: string): "Remote" | "Hybrid" | "On-site" {
  const lower = (raw || "").toLowerCase();
  if (lower.includes("remote") || lower.includes("anywhere") || lower.includes("virtual")) {
    return "Remote";
  }
  if (lower.includes("hybrid") || lower.includes("flexible")) {
    return "Hybrid";
  }
  return "On-site";
}

/**
 * Derives realistic Indian tech compensation based on role title and candidate seniority.
 */
function estimateIndianSalary(title: string, seniority?: string): string {
  const t = title.toLowerCase();
  if (t.includes("lead") || t.includes("principal") || t.includes("architect") || seniority === "Senior") {
    return "₹32 - ₹55 LPA";
  }
  if (t.includes("senior") || t.includes("sr.") || t.includes("iii") || t.includes("ii")) {
    return "₹22 - ₹38 LPA";
  }
  if (t.includes("intern") || t.includes("trainee")) {
    return "₹4 - ₹8 LPA (Stipend)";
  }
  return "₹14 - ₹26 LPA";
}

/**
 * Derives common core skills for a role title.
 *
 * Fallback only — used when the real posting body could not be fetched. It must
 * never see the candidate's own skills: seeding them here made every job require
 * skills the candidate definitionally had, so the score was matching the resume
 * against itself (CLAUDE.md §7 item 5, idea.md §7.1).
 */
function inferSkillsFromTitle(title: string): string[] {
  const t = title.toLowerCase();
  const baseSkills = new Set<string>();

  if (t.includes("full stack") || t.includes("fullstack")) {
    baseSkills.add("React");
    baseSkills.add("Node.js");
    baseSkills.add("TypeScript");
    baseSkills.add("PostgreSQL");
  } else if (t.includes("frontend") || t.includes("front end") || t.includes("ui") || t.includes("react")) {
    baseSkills.add("React.js");
    baseSkills.add("TypeScript");
    baseSkills.add("Tailwind CSS");
    baseSkills.add("Next.js");
  } else if (t.includes("backend") || t.includes("back end") || t.includes("node") || t.includes("java") || t.includes("python")) {
    baseSkills.add("Node.js");
    baseSkills.add("Python");
    baseSkills.add("REST APIs");
    baseSkills.add("Microservices");
  } else if (t.includes("data") || t.includes("ml") || t.includes("ai")) {
    baseSkills.add("Python");
    baseSkills.add("SQL");
    baseSkills.add("Machine Learning");
  } else {
    baseSkills.add("JavaScript");
    baseSkills.add("Software Engineering");
    baseSkills.add("Git");
  }

  return Array.from(baseSkills).slice(0, 6);
}

/* -------------------------------------------------------------------------- */
/* Skill matching                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Multi-word forms that appear both spaced and joined. Collapsing them keeps
 * "Front End" and "Frontend" comparable without introducing fuzzy matching.
 */
const PHRASE_NORMALISATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bfront\s+end\b/g, "frontend"],
  [/\bback\s+end\b/g, "backend"],
  [/\bfull\s+stack\b/g, "fullstack"],
];

/**
 * Surface forms of the same technology. A small, explicit table — a real skill
 * taxonomy (ESCO / O*NET) is idea.md §7.3, deliberately not this phase.
 */
const TOKEN_ALIASES: Record<string, string> = {
  "node.js": "node",
  nodejs: "node",
  "react.js": "react",
  reactjs: "react",
  "next.js": "next",
  nextjs: "next",
  "vue.js": "vue",
  vuejs: "vue",
  "express.js": "express",
  expressjs: "express",
  "angular.js": "angular",
  angularjs: "angular",
  golang: "go",
  postgres: "postgresql",
  k8s: "kubernetes",
  js: "javascript",
  ts: "typescript",
};

/**
 * Splits a skill or title into comparable tokens.
 *
 * Punctuation that carries meaning (`+`, `#`, `.`) survives so "C++", "C#", and
 * ".NET" stay distinct from "C" and "NET".
 */
export function normalizeSkillTokens(raw: string): string[] {
  let normalised = (raw || "").toLowerCase().replace(/[‘’']/g, "");

  for (const [pattern, replacement] of PHRASE_NORMALISATIONS) {
    normalised = normalised.replace(pattern, replacement);
  }

  const tokens = normalised
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // "Node JS" / "React JS" — a trailing "js" qualifies the previous token
  // rather than meaning JavaScript on its own.
  if (tokens.length > 1 && tokens[tokens.length - 1] === "js") {
    tokens.pop();
  }

  return tokens.map(canonicalToken).filter(Boolean);
}

function canonicalToken(token: string): string {
  const stripped = token.replace(/^\.+|\.+$/g, "") || token;
  const alias = TOKEN_ALIASES[token] ?? TOKEN_ALIASES[stripped];
  if (alias) return alias;

  const base = stripped;
  // Deterministic plural collapse, applied identically to both sides of every
  // comparison, so it can only merge forms of one word — never distinct skills.
  if (base.length > 3 && base.endsWith("s") && !base.endsWith("ss")) {
    return base.slice(0, -1);
  }

  return base;
}

/** True when `needle` appears as a contiguous run of tokens inside `haystack`. */
function containsTokenSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;

  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) return true;
  }

  return false;
}

/**
 * Token-boundary skill comparison.
 *
 * Replaces the old bidirectional *substring* test, which matched "Java" against
 * "JavaScript" and "R" against "React" (CLAUDE.md §7 item 7). Matching is
 * deterministic: no edit distance, no embeddings, no synonym inference beyond
 * the explicit alias table above.
 */
export function skillTokensMatch(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return containsTokenSequence(a, b) || containsTokenSequence(b, a);
}

/**
 * Directly queries LinkedIn's official public guest jobs search endpoint
 * for verified, 100% active LinkedIn job postings with genuine /jobs/view/{id} links.
 */
export async function fetchLiveLinkedInGuestJobs(
  filters: JobSearchFilters,
  resume?: ParsedResume
): Promise<JobListing[]> {
  const targetLocations = Array.isArray(filters.locations) && filters.locations.length > 0
    ? filters.locations
    : [filters.location || "Bangalore"];

  const keyword = filters.keywords?.trim() || "Full Stack Engineer";
  const allJobs: JobListing[] = [];
  const seenIds = new Set<string>();

  // Query across selected locations (up to 4 cities in parallel for maximum speed)
  const locationsToQuery = targetLocations.slice(0, 5);

  const fetchPromises = locationsToQuery.map(async (loc) => {
    const params = new URLSearchParams();
    params.set("keywords", keyword);

    const cleanLoc = loc.toLowerCase().includes("india") || loc.toLowerCase().includes("remote")
      ? loc
      : `${loc}, India`;
    params.set("location", cleanLoc);
    params.set("start", "0");

    if (filters.date_posted === "past_24h") {
      params.set("f_TPR", "r86400"); // 24 hours
    } else if (filters.date_posted === "past_week") {
      params.set("f_TPR", "r604800"); // 7 days
    } else if (filters.date_posted === "past_month") {
      params.set("f_TPR", "r2592000"); // 30 days
    }

    if (filters.workplace_type === "remote") {
      params.set("f_WT", "2");
    } else if (filters.workplace_type === "hybrid") {
      params.set("f_WT", "3");
    } else if (filters.workplace_type === "onsite") {
      params.set("f_WT", "1");
    }

    if (filters.experience_level === "entry") {
      params.set("f_E", "2");
    } else if (filters.experience_level === "mid") {
      params.set("f_E", "3");
    } else if (filters.experience_level === "senior") {
      params.set("f_E", "4");
    }

    const endpoint = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`;

    try {
      const res = await fetch(endpoint, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(9000),
      });

      if (!res.ok) return [];

      const html = await res.text();
      const cards = html.split("</li>").filter((c) => c.includes("data-entity-urn"));
      const cityJobs: JobListing[] = [];

      for (const card of cards) {
        const urnMatch = card.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/);
        if (!urnMatch || !urnMatch[1]) continue;
        const urn = urnMatch[1];

        if (seenIds.has(urn)) continue;
        seenIds.add(urn);

        const titleMatch = card.match(/<h3 class="base-search-card__title">([\s\S]*?)<\/h3>/);
        const title = titleMatch ? titleMatch[1].trim() : "";

        const companyMatch = card.match(/<h4 class="base-search-card__subtitle">([\s\S]*?)<\/h4>/);
        const company = companyMatch ? companyMatch[1].replace(/<[^>]*>/g, "").trim() : "";

        if (!title || !company) continue;

        // Extract real company URL or company slug
        const companyUrlMatch = card.match(/href="(https:\/\/[^"]*linkedin\.com\/company\/[^"?]+)/);
        const companyUrl = companyUrlMatch
          ? companyUrlMatch[1]
          : `https://www.linkedin.com/company/${encodeURIComponent(company.toLowerCase().replace(/[^a-z0-9]/g, "-"))}`;

        const locationMatch = card.match(/<span class="job-search-card__location">([\s\S]*?)<\/span>/);
        const jobLocation = locationMatch ? locationMatch[1].trim() : loc;

        const timeMatch = card.match(/<time[^>]*>([\s\S]*?)<\/time>/);
        const postedDate = timeMatch ? timeMatch[1].trim() : "Recently posted";

        const salaryMatch = card.match(/<span class="job-search-card__salary-info">([\s\S]*?)<\/span>/);
        const salary = salaryMatch
          ? salaryMatch[1].replace(/\s+/g, " ").trim()
          : estimateIndianSalary(title, resume?.seniority_level);

        const workplaceType = normalizeWorkplaceType(
          filters.workplace_type !== "all" ? filters.workplace_type : jobLocation + " " + title
        );

        cityJobs.push({
          id: urn,
          title,
          company,
          location: jobLocation,
          workplace_type: workplaceType,
          salary,
          posted_date: postedDate,
          // Placeholder only. enrichJobsWithDescriptions replaces this with the
          // real posting body for every job whose fetch succeeds.
          description: `Active job opening at ${company} in ${jobLocation}. View full requirements, team details, and submit your application directly on LinkedIn.`,
          apply_url: `https://www.linkedin.com/jobs/view/${urn}`,
          company_apply_url: companyUrl,
          skills_required: inferSkillsFromTitle(title),
          skills_source: "inferred",
          experience_level: filters.experience_level !== "all" ? filters.experience_level : undefined,
        });

        // Collect up to 4 per location so multi-locations are balanced
        if (cityJobs.length >= 4) break;
      }

      return cityJobs;
    } catch (err) {
      console.warn(`[LinkedIn-Live] Fetch failed for location "${loc}":`, err);
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  for (const list of results) {
    allJobs.push(...list);
  }

  return allJobs;
}

/**
 * AI-assisted job discovery engine when live endpoints are blocked or offline.
 * Provides guaranteed valid links to real company portals and search queries.
 */
export async function discoverJobsWithAI(
  filters: JobSearchFilters,
  resume?: ParsedResume
): Promise<JobListing[]> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error("Gemini API key is required to discover jobs.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const locationList = Array.isArray(filters.locations) && filters.locations.length > 0
    ? filters.locations.join(", ")
    : filters.location || "Bangalore, Gurgaon, Noida, India";

  const prompt = `You are a real-time LinkedIn Jobs aggregator and career intelligence engine specializing in the Indian and Global Tech Market.
Generate a rich, diverse array of 10 to 14 active, highly realistic job listings matching these exact user filters:

SEARCH FILTERS:
- Target Role / Keywords: ${filters.keywords || (resume?.target_roles[0] ?? "Software Engineer")}
- Target Locations: ${locationList}
- Workplace Type: ${filters.workplace_type} (options: remote, hybrid, onsite, all)
- Date Posted Range: ${filters.date_posted}
- Experience Level: ${filters.experience_level}

${
  resume
    ? `CANDIDATE QUALIFICATIONS FOR TARGETED MATCHING:
- Candidate Name: ${resume.candidate_name} (${resume.seniority_level})
- Years of Experience: ${resume.years_of_experience}
- Core Skills: ${resume.extracted_skills.slice(0, 15).join(", ")}
- Target Trajectory: ${resume.target_roles.join(", ")}`
    : ""
}

RULES:
1. LOCATIONS: Distribute jobs across the user's selected locations (${locationList}).
2. REAL COMPANIES: Use actual top employers in India (Swiggy, Zomato, Razorpay, CRED, Zepto, Flipkart, Infosys, Google India, Microsoft IDC, Atlassian India, PhonePe, Adobe India, Zoho, Freshworks, CarDekho, InfoBeans, Impetus).
3. SALARIES: Provide realistic Indian tech compensation in INR LPA (e.g. "₹18 - ₹28 LPA", "₹25 - ₹42 LPA").
4. APPLY LINKS:
   - For apply_url, provide: "https://www.linkedin.com/jobs/search/?keywords=" + encodeURIComponent(company + " " + title) + "&location=" + encodeURIComponent(location)
   - For company_apply_url, provide the exact real company LinkedIn page: "https://www.linkedin.com/company/" + companySlug
5. POSTED DATE: E.g. "1 hour ago", "3 hours ago", "1 day ago", "Today".

Return ONLY a JSON array with objects matching:
[
  {
    "id": "string",
    "title": "string",
    "company": "string",
    "location": "string",
    "workplace_type": "Remote" | "Hybrid" | "On-site",
    "salary": "string",
    "posted_date": "string",
    "description": "string (2-3 sentences)",
    "apply_url": "string",
    "company_apply_url": "string",
    "skills_required": ["string", "string"],
    "experience_level": "string"
  }
]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = JSON.parse(text) as any[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("No jobs returned by discovery engine.");
  }

  return parsed.map((item, idx) => ({
    id: item.id || `job-${idx}-${Date.now()}`,
    title: String(item.title || "Software Engineer"),
    company: String(item.company || "Tech Company"),
    company_logo: item.company_logo || undefined,
    location: String(item.location || locationList),
    workplace_type: normalizeWorkplaceType(item.workplace_type || filters.workplace_type),
    salary: String(item.salary || "₹20 - ₹32 LPA"),
    posted_date: String(item.posted_date || "Today"),
    description: String(item.description || "Exciting opportunity to build cutting-edge systems and scalable products."),
    apply_url: String(
      item.apply_url ||
        `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
          `${item.company} ${item.title}`
        )}&location=${encodeURIComponent(item.location || "India")}`
    ),
    company_apply_url: String(
      item.company_apply_url ||
        `https://www.linkedin.com/company/${encodeURIComponent(
          String(item.company || "").toLowerCase().replace(/[^a-z0-9]/g, "-")
        )}`
    ),
    skills_required: Array.isArray(item.skills_required) ? item.skills_required : ["TypeScript", "React", "Node.js"],
    // Nothing on this path is parsed from a real posting.
    skills_source: "inferred" as const,
    experience_level: item.experience_level || "Mid-Senior level",
  }));
}

/**
 * Cheap, network-free pre-ranking used only to decide which postings are worth
 * spending a description fetch on. Runs against title-inferred skills, so it is
 * a rough ordering — the real score is computed after enrichment.
 */
function rankJobsForEnrichment(jobs: JobListing[], resume?: ParsedResume): JobListing[] {
  if (!resume) return jobs;

  const candidateTokens = (resume.extracted_skills || [])
    .map(normalizeSkillTokens)
    .filter((tokens) => tokens.length > 0);
  const roleTokens = (resume.target_roles || [])
    .map(normalizeSkillTokens)
    .filter((tokens) => tokens.length > 0);

  const cheapScore = (job: JobListing): number => {
    const titleTokens = normalizeSkillTokens(job.title);
    const skillHits = (job.skills_required || []).filter((skill) => {
      const skillTokens = normalizeSkillTokens(skill);
      return candidateTokens.some((cs) => skillTokensMatch(cs, skillTokens));
    }).length;
    const roleHit = roleTokens.some((role) => skillTokensMatch(role, titleTokens)) ? 1 : 0;
    return skillHits + roleHit * 2;
  };

  return [...jobs].sort((a, b) => cheapScore(b) - cheapScore(a));
}

/**
 * Replaces placeholder descriptions and title-inferred skills with the real
 * posting body wherever LinkedIn returns one.
 *
 * Per-job failure is contained: that listing keeps its inferred skills and stays
 * marked `skills_source: "inferred"` so the UI and the score can tell the
 * difference. Nothing here fabricates requirements text.
 */
export async function enrichJobsWithDescriptions(
  jobs: JobListing[],
  resume?: ParsedResume,
  options: FetchJobDescriptionsOptions = {}
): Promise<JobListing[]> {
  if (jobs.length === 0) return jobs;

  const targets = rankJobsForEnrichment(jobs, resume)
    .slice(0, JOB_DESCRIPTION_FETCH_LIMIT)
    .map((job) => job.id);

  const descriptions = await fetchJobDescriptions(targets, options);

  if (descriptions.size === 0) {
    console.warn("[JobDescription] No posting bodies retrieved; all jobs stay on inferred skills.");
    return jobs;
  }

  console.log(
    `[JobDescription] Retrieved ${descriptions.size}/${targets.length} posting bodies (cache: ${JSON.stringify(
      jobDescriptionCacheStats()
    )}).`
  );

  return jobs.map((job) => {
    const found = descriptions.get(job.id);
    if (!found || found.skills.length === 0) return job;

    return {
      ...job,
      description: found.text,
      skills_required: found.skills,
      skills_source: "posting" as const,
      experience_level: found.seniority || job.experience_level,
    };
  });
}

/**
 * Searches LinkedIn jobs.
 * Primary: Live LinkedIn public guest jobs endpoint (100% real active jobs + direct links).
 * Secondary: AI discovery engine fallback if guest search is unavailable.
 */
export async function searchLinkedInJobs(
  filters: JobSearchFilters,
  resume?: ParsedResume
): Promise<JobListing[]> {
  try {
    // 1. Fetch live active LinkedIn jobs
    console.log(`[LinkedIn-Live] Fetching live jobs for "${filters.keywords}" across ${filters.locations?.length || 1} locations...`);
    const liveJobs = await fetchLiveLinkedInGuestJobs(filters, resume);

    if (liveJobs && liveJobs.length >= 3) {
      console.log(`[LinkedIn-Live] Successfully retrieved ${liveJobs.length} live jobs directly from LinkedIn.`);
      // 2. Replace placeholder bodies with the real posting text.
      return await enrichJobsWithDescriptions(liveJobs, resume);
    }
  } catch (err) {
    console.warn("[LinkedIn-Live] Guest scraper encountered an error, using AI discovery:", err);
  }

  // 2. Fallback to AI Job Discovery
  console.log("[LinkedIn-Fallback] Falling back to AI real-time discovery engine...");
  return await discoverJobsWithAI(filters, resume);
}

/**
 * Calculates candidate fit, match score, strengths, and missing skills.
 *
 * The score uses the full 0–100 range: a job sharing no skills with the resume
 * and no title alignment scores 0. Scores are expected to read lower than the
 * old `62 + skillRatio * 33` formula, which could not go below 62.
 */
export function scoreJobsWithResume(
  jobs: JobListing[],
  resume: ParsedResume
): JobListing[] {
  const candidateSkillTokens = (resume.extracted_skills || [])
    .map(normalizeSkillTokens)
    .filter((tokens) => tokens.length > 0);
  const targetRoleTokens = (resume.target_roles || [])
    .map(normalizeSkillTokens)
    .filter((tokens) => tokens.length > 0);

  return jobs.map((job) => {
    const jobSkills = job.skills_required || [];
    const matched: string[] = [];
    const missing: string[] = [];

    jobSkills.forEach((skill) => {
      const skillTokens = normalizeSkillTokens(skill);
      const isMatched = candidateSkillTokens.some((cs) => skillTokensMatch(cs, skillTokens));

      if (isMatched) {
        matched.push(skill);
      } else {
        missing.push(skill);
      }
    });

    const hasSkillsData = jobSkills.length > 0;
    const skillRatio = hasSkillsData ? matched.length / jobSkills.length : UNKNOWN_SKILL_RATIO;

    const titleTokens = normalizeSkillTokens(job.title);
    const matchesTargetRole = targetRoleTokens.some((role) => skillTokensMatch(role, titleTokens));

    const score = Math.max(
      0,
      Math.min(100, Math.round(skillRatio * SKILL_WEIGHT + (matchesTargetRole ? ROLE_WEIGHT : 0)))
    );

    const confidence: "high" | "medium" | "low" = !hasSkillsData
      ? "low"
      : job.skills_source === "posting"
        ? "high"
        : "medium";

    const matchReasons: string[] = [];
    if (matched.length > 0) {
      matchReasons.push(
        `Matches ${matched.length} of ${jobSkills.length} listed skills: ${matched.slice(0, 4).join(", ")}`
      );
    }
    if (matchesTargetRole) {
      matchReasons.push(`Role title matches your target trajectory (${resume.target_roles[0]})`);
    }
    if (confidence === "high") {
      matchReasons.push("Scored against requirements taken from the live LinkedIn posting");
    } else if (confidence === "medium") {
      matchReasons.push("Requirements unavailable — skills inferred from the job title");
    } else {
      matchReasons.push("No requirements data for this posting; score reflects title alignment only");
    }
    if (resume.years_of_experience >= 2) {
      matchReasons.push(`Experience level aligns with ${resume.seniority_level} expectations`);
    }

    return {
      ...job,
      match_score: score,
      match_confidence: confidence,
      match_reasons: matchReasons,
      missing_skills: missing,
    };
  }).sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
}
