import { GoogleGenerativeAI } from "@google/generative-ai";
import { JobListing, JobSearchFilters, ParsedResume } from "./types";

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

/* ------------------------------------------------------------------ *
 * Skill vocabulary & token-boundary matching
 *
 * Matching is deterministic: both sides are normalized to a token list,
 * then resolved through an alias table to a canonical name. Two skills
 * match only when their canonical names are equal, or - for terms outside
 * the vocabulary - when one's tokens appear as a contiguous run inside the
 * other's. Substring containment is never used, so "Java" does not match
 * "JavaScript" and "R" does not match "React".
 * ------------------------------------------------------------------ */

/** Punctuation-bearing names that would otherwise lose meaning when tokenized. */
const SKILL_PUNCTUATION_ALIASES: Array<[RegExp, string]> = [
  [/objective[-\s]?c\b/g, " objectivec "],
  [/c\+\+/g, " cpp "],
  [/\bc#/g, " csharp "],
  [/\bf#/g, " fsharp "],
  [/\.net\b/g, " dotnet "],
];

function normalizeSkillTokens(raw: string): string[] {
  let s = (raw || "").toLowerCase();
  for (const [pattern, replacement] of SKILL_PUNCTUATION_ALIASES) {
    s = s.replace(pattern, replacement);
  }
  return s
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Canonical skill name followed by its aliases. The canonical name is itself
 * treated as an alias. Everything here is a plain synonym table - no fuzzy or
 * semantic expansion (see idea.md 7.3 for where that belongs).
 */
const SKILL_VOCABULARY: string[][] = [
  // Languages
  ["JavaScript", "js", "ecmascript", "es6"],
  ["TypeScript", "ts"],
  ["Python", "python3"],
  ["Java"],
  ["Kotlin"],
  ["Swift"],
  ["Objective-C", "objectivec"],
  ["C++", "cpp"],
  ["C#", "csharp"],
  ["C"],
  ["Go", "golang"],
  ["Rust"],
  ["Ruby"],
  ["PHP"],
  ["Scala"],
  ["R"],
  ["Perl"],
  ["Dart"],
  ["Elixir"],
  ["Shell Scripting", "bash", "shell", "shell script", "powershell"],
  ["SQL"],
  ["HTML", "html5"],
  ["CSS", "css3"],
  // Frontend
  ["React", "reactjs", "react js"],
  ["React Native", "reactnative"],
  ["Next.js", "nextjs", "next js"],
  ["Angular", "angularjs", "angular js"],
  ["Vue.js", "vue", "vuejs", "vue js"],
  ["Svelte", "sveltekit"],
  ["Redux", "redux toolkit"],
  ["jQuery"],
  ["Tailwind CSS", "tailwind", "tailwindcss"],
  ["Bootstrap"],
  ["SASS", "scss", "less"],
  ["Webpack"],
  ["Vite"],
  ["Storybook"],
  ["Responsive Design", "responsive web design"],
  ["Accessibility", "wcag", "a11y"],
  // Backend & APIs
  ["Node.js", "node", "nodejs", "node js"],
  ["Express.js", "express", "expressjs", "express js"],
  ["NestJS", "nest js"],
  ["Django"],
  ["Flask"],
  ["FastAPI"],
  ["Spring", "spring framework"],
  ["Spring Boot", "springboot"],
  ["Hibernate"],
  [".NET", "dotnet", "dotnet core"],
  ["ASP.NET", "asp dotnet", "aspnet"],
  ["Laravel"],
  ["Rails", "ruby on rails", "rubyonrails"],
  ["REST APIs", "rest", "rest api", "restful", "restful api", "restful apis"],
  ["GraphQL"],
  ["gRPC"],
  ["WebSockets", "websocket", "socket io"],
  ["Microservices", "microservice", "microservices architecture"],
  ["OAuth", "oauth2", "oauth 2 0"],
  ["JWT", "json web token", "json web tokens"],
  // Data stores
  ["PostgreSQL", "postgres", "postgre sql"],
  ["MySQL"],
  ["MongoDB", "mongo"],
  ["Redis"],
  ["Elasticsearch", "elastic search", "opensearch"],
  ["Cassandra"],
  ["DynamoDB"],
  ["Oracle", "oracle db", "plsql", "pl sql"],
  ["SQL Server", "mssql", "microsoft sql server"],
  ["Snowflake"],
  ["BigQuery", "big query"],
  ["Databricks"],
  ["Kafka", "apache kafka"],
  ["RabbitMQ", "rabbit mq"],
  ["Airflow", "apache airflow"],
  ["Spark", "apache spark", "pyspark"],
  ["Hadoop"],
  ["ETL", "etl pipelines", "elt"],
  ["Data Warehousing", "data warehouse"],
  ["Data Modeling", "data modelling"],
  // Cloud & infrastructure
  ["AWS", "amazon web services"],
  ["Azure", "microsoft azure"],
  ["GCP", "google cloud", "google cloud platform"],
  ["Docker", "containerization", "containers"],
  ["Kubernetes", "k8s", "eks", "aks"],
  ["Terraform"],
  ["Ansible"],
  ["Jenkins"],
  ["GitHub Actions", "github action"],
  ["GitLab CI", "gitlab ci cd"],
  ["CI/CD", "ci cd", "continuous integration", "continuous delivery", "continuous deployment"],
  ["Linux", "unix"],
  ["Nginx"],
  ["Serverless", "lambda", "aws lambda", "cloud functions"],
  ["Monitoring", "observability", "prometheus", "grafana", "datadog"],
  ["Git", "version control", "github", "gitlab", "bitbucket"],
  // Mobile
  ["Android", "android sdk"],
  ["iOS", "ios sdk"],
  ["Flutter"],
  ["SwiftUI", "swift ui"],
  ["Jetpack Compose"],
  // Data science / ML
  ["Machine Learning", "ml"],
  ["Deep Learning"],
  ["NLP", "natural language processing"],
  ["Computer Vision", "opencv"],
  ["TensorFlow", "tensor flow"],
  ["PyTorch", "torch"],
  ["scikit-learn", "sklearn", "scikit learn"],
  ["Pandas"],
  ["NumPy"],
  ["LLMs", "llm", "large language models", "generative ai", "genai"],
  ["AI", "artificial intelligence"],
  ["Statistics", "statistical analysis"],
  ["Power BI", "powerbi"],
  ["Tableau"],
  ["Excel", "advanced excel"],
  // Testing & practices
  ["Unit Testing", "unit tests"],
  ["Jest"],
  ["Cypress"],
  ["Playwright"],
  ["Selenium"],
  ["JUnit"],
  ["Pytest"],
  ["TDD", "test driven development"],
  ["Agile", "scrum", "kanban"],
  ["System Design", "distributed systems", "scalability"],
  ["Code Review", "code reviews"],
  ["Design Patterns"],
  ["Data Structures", "data structures and algorithms", "dsa", "algorithms"],
  ["Security", "application security", "appsec", "owasp"],
];

/** alias token-string -> canonical display name */
const SKILL_ALIAS_MAP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const entry of SKILL_VOCABULARY) {
    const canonical = entry[0];
    for (const alias of entry) {
      const key = normalizeSkillTokens(alias).join(" ");
      if (key && !map.has(key)) map.set(key, canonical);
    }
  }
  return map;
})();

/** Longest alias (in tokens), so description scanning can match greedily. */
const SKILL_ALIAS_MAX_TOKENS = (() => {
  let max = 1;
  for (const key of SKILL_ALIAS_MAP.keys()) {
    max = Math.max(max, key.split(" ").length);
  }
  return max;
})();

/**
 * Aliases too generic to harvest from free text ("go to production", "R&D",
 * "C level"). They stay in the alias map so explicit skill lists still resolve.
 */
const EXTRACTION_STOP_ALIASES = new Set(["go", "r", "c", "ts", "ml", "less", "shell", "torch"]);

interface SkillKey {
  /** Canonical display name when the term is in the vocabulary. */
  canonical?: string;
  /** Normalized token list. */
  tokens: string[];
  /** Tokens joined with spaces - the comparison key for unknown terms. */
  key: string;
}

function toSkillKey(raw: string): SkillKey {
  const tokens = normalizeSkillTokens(raw);
  const key = tokens.join(" ");
  return { canonical: SKILL_ALIAS_MAP.get(key), tokens, key };
}

/** Resolves a skill to its canonical vocabulary name, or a normalized form. */
export function canonicalizeSkill(raw: string): string {
  const resolved = toSkillKey(raw);
  return resolved.canonical ?? resolved.key;
}

/** True when `needle` appears as a contiguous run of tokens inside `haystack`. */
function containsTokenRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  // Single short tokens ("r", "c", "go") are too ambiguous to match by run.
  if (needle.length === 1 && needle[0].length < 2) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * Token-boundary skill comparison. Never uses substring containment.
 */
export function skillsAreEquivalent(a: string, b: string): boolean {
  const left = toSkillKey(a);
  const right = toSkillKey(b);

  if (!left.key || !right.key) return false;
  if (left.key === right.key) return true;

  // Both known to the vocabulary: canonical identity is the whole answer.
  if (left.canonical && right.canonical) return left.canonical === right.canonical;

  // At least one term is outside the vocabulary - fall back to token runs
  // ("Node" vs "Node.js Development"), still on token boundaries.
  return (
    containsTokenRun(left.tokens, right.tokens) ||
    containsTokenRun(right.tokens, left.tokens)
  );
}

/* ------------------------------------------------------------------ *
 * HTML -> plain text
 * ------------------------------------------------------------------ */

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "...",
  mdash: "-",
  ndash: "-",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  bull: "-",
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Converts posting markup to plain text. Raw HTML never leaves this function,
 * so nothing downstream (scoring, CSV, a model prompt) ever sees tags.
 */
export function stripHtmlToText(html: string): string {
  if (!html) return "";
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|ul|ol|tr|h[1-6]|section)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(text)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ *
 * Skill extraction from real posting text
 * ------------------------------------------------------------------ */

const DESCRIPTION_MAX_SKILLS = 14;

/**
 * Scans posting text for vocabulary skills, greedily preferring longer names
 * ("Spring Boot" over "Spring"). Ranked by how often the posting mentions each
 * skill, then by first appearance.
 */
export function extractSkillsFromText(text: string, limit: number = DESCRIPTION_MAX_SKILLS): string[] {
  if (!text) return [];

  const tokens = normalizeSkillTokens(text);
  const found = new Map<string, { count: number; firstIndex: number }>();

  for (let i = 0; i < tokens.length; i++) {
    const maxSpan = Math.min(SKILL_ALIAS_MAX_TOKENS, tokens.length - i);
    for (let span = maxSpan; span >= 1; span--) {
      const gram = tokens.slice(i, i + span).join(" ");
      if (span === 1 && EXTRACTION_STOP_ALIASES.has(gram)) continue;
      const canonical = SKILL_ALIAS_MAP.get(gram);
      if (!canonical) continue;

      const existing = found.get(canonical);
      if (existing) {
        existing.count += 1;
      } else {
        found.set(canonical, { count: 1, firstIndex: i });
      }
      i += span - 1; // consume the matched run
      break;
    }
  }

  return Array.from(found.entries())
    .sort((a, b) => b[1].count - a[1].count || a[1].firstIndex - b[1].firstIndex)
    .slice(0, limit)
    .map(([canonical]) => canonical);
}

/**
 * Fallback only: derives likely core skills from a job title when the real
 * posting body could not be fetched. Never seeded with candidate skills -
 * a job must never be constructed to require what the candidate already has.
 */
function inferSkillsFromTitle(title: string): string[] {
  const t = (title || "").toLowerCase();
  const baseSkills = new Set<string>();

  if (t.includes("full stack") || t.includes("fullstack")) {
    baseSkills.add("React");
    baseSkills.add("Node.js");
    baseSkills.add("TypeScript");
    baseSkills.add("PostgreSQL");
  } else if (t.includes("frontend") || t.includes("front end") || t.includes("ui") || t.includes("react")) {
    baseSkills.add("React");
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

/* ------------------------------------------------------------------ *
 * Per-job posting fetch, with an in-memory TTL cache
 * ------------------------------------------------------------------ */

/** Descriptions are fetched for the top N cheaply-ranked results only. */
export const DESCRIPTION_FETCH_LIMIT = 25;
/** Parallel posting fetches in flight at once. */
export const DESCRIPTION_FETCH_CONCURRENCY = 6;
/** Per-request timeout, matching the guest search endpoint's budget. */
export const DESCRIPTION_FETCH_TIMEOUT_MS = 9000;
/** Hard ceiling for the whole enrichment phase, so a slow LinkedIn cannot hang the route. */
export const DESCRIPTION_FETCH_BUDGET_MS = 20000;
/**
 * Postings are effectively immutable once published and stay live for weeks,
 * so a 6 hour TTL keeps results same-day fresh while letting repeat searches
 * over the same market (Bangalore React roles, etc.) serve from memory.
 */
export const DESCRIPTION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Bounded so a long-lived server process cannot grow without limit. */
export const DESCRIPTION_CACHE_MAX_ENTRIES = 500;
/** Cap on stored plain text per posting. */
const DESCRIPTION_MAX_CHARS = 8000;

const LINKEDIN_GUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
} as const;

export interface JobPostingDetail {
  /** Plain text posting body - never HTML. */
  description: string;
  /** Skills recognized in the posting body. */
  skills: string[];
  /** LinkedIn's own "Seniority level" criterion, when the posting states one. */
  seniority?: string;
  /** LinkedIn's own "Employment type" criterion, when the posting states one. */
  employment_type?: string;
}

interface CacheEntry {
  detail: JobPostingDetail;
  expiresAt: number;
}

const postingCache = new Map<string, CacheEntry>();
let cacheHits = 0;
let cacheMisses = 0;

/** Test/ops helper: empties the posting cache and resets counters. */
export function clearPostingCache(): void {
  postingCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

/** Test/ops helper: current cache size and hit/miss counters. */
export function getPostingCacheStats(): { size: number; hits: number; misses: number } {
  return { size: postingCache.size, hits: cacheHits, misses: cacheMisses };
}

function readCache(jobId: string, now: number): JobPostingDetail | undefined {
  const entry = postingCache.get(jobId);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    postingCache.delete(jobId);
    return undefined;
  }
  return entry.detail;
}

function writeCache(jobId: string, detail: JobPostingDetail, now: number): void {
  // Drop expired entries first, then the oldest inserted, to stay under the cap.
  for (const [key, entry] of postingCache) {
    if (entry.expiresAt <= now) postingCache.delete(key);
  }
  while (postingCache.size >= DESCRIPTION_CACHE_MAX_ENTRIES) {
    const oldest = postingCache.keys().next();
    if (oldest.done) break;
    postingCache.delete(oldest.value);
  }
  postingCache.set(jobId, { detail, expiresAt: now + DESCRIPTION_CACHE_TTL_MS });
}

/** Reads the "Seniority level" / "Employment type" criteria list. */
function parseJobCriteria(html: string): Record<string, string> {
  const criteria: Record<string, string> = {};
  const itemPattern =
    /<h3 class="description__job-criteria-subheader">([\s\S]*?)<\/h3>\s*<span class="description__job-criteria-text[^"]*">([\s\S]*?)<\/span>/g;

  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(html)) !== null) {
    const label = stripHtmlToText(match[1]).toLowerCase();
    const value = stripHtmlToText(match[2]);
    if (label && value) criteria[label] = value;
  }
  return criteria;
}

/**
 * Parses a per-job guest response into plain text plus recognized skills.
 * Returns null when the response carries no posting body.
 */
export function parseJobPostingHtml(html: string): JobPostingDetail | null {
  if (!html) return null;

  const markerIndex = html.indexOf("show-more-less-html__markup");
  if (markerIndex === -1) return null;

  const bodyStart = html.indexOf(">", markerIndex);
  if (bodyStart === -1) return null;

  // The body ends at whichever comes first: its closing div or the show-more button.
  const closingDiv = html.indexOf("</div>", bodyStart);
  const showMoreButton = html.indexOf("show-more-less-html__button", bodyStart);
  const candidates = [closingDiv, showMoreButton].filter((i) => i !== -1);
  const bodyEnd = candidates.length > 0 ? Math.min(...candidates) : html.length;

  const description = stripHtmlToText(html.slice(bodyStart + 1, bodyEnd)).slice(0, DESCRIPTION_MAX_CHARS);
  if (!description) return null;

  const criteria = parseJobCriteria(html);

  return {
    description,
    skills: extractSkillsFromText(description),
    seniority: criteria["seniority level"],
    employment_type: criteria["employment type"],
  };
}

/**
 * Fetches one posting body from LinkedIn's per-job guest endpoint, serving
 * from the TTL cache when possible. Returns null on any failure - callers fall
 * back to title inference rather than inventing requirements.
 */
export async function fetchJobPostingDetail(
  jobId: string,
  timeoutMs: number = DESCRIPTION_FETCH_TIMEOUT_MS
): Promise<JobPostingDetail | null> {
  // Only genuine numeric LinkedIn URNs are fetchable.
  if (!/^\d+$/.test(jobId)) return null;

  const now = Date.now();
  const cached = readCache(jobId, now);
  if (cached) {
    cacheHits += 1;
    return cached;
  }
  cacheMisses += 1;

  const endpoint = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;

  try {
    const res = await fetch(endpoint, {
      headers: LINKEDIN_GUEST_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      console.warn(`[LinkedIn-Posting] ${jobId} returned HTTP ${res.status}`);
      return null;
    }

    const detail = parseJobPostingHtml(await res.text());
    if (!detail) return null;

    writeCache(jobId, detail, Date.now());
    return detail;
  } catch (err) {
    console.warn(`[LinkedIn-Posting] Fetch failed for job ${jobId}:`, err);
    return null;
  }
}

/** Runs `worker` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/* ------------------------------------------------------------------ *
 * Cheap pre-ranking (no network) + description enrichment
 * ------------------------------------------------------------------ */

const ROLE_TOKEN_ALIASES: Record<string, string> = {
  developer: "engineer",
  dev: "engineer",
  programmer: "engineer",
  engineering: "engineer",
  sde: "engineer",
};

const ROLE_STOP_TOKENS = new Set(["a", "an", "the", "and", "or", "for", "of", "in", "at", "jr", "sr", "i", "ii", "iii"]);

function roleTokens(raw: string): string[] {
  return normalizeSkillTokens(raw)
    .map((token) => ROLE_TOKEN_ALIASES[token] ?? token)
    .filter((token) => !ROLE_STOP_TOKENS.has(token));
}

/**
 * 0-1 overlap between a job title and the candidate's target roles, on token
 * boundaries. Used both for cheap pre-ranking and as a scoring signal.
 */
function roleAlignment(title: string, targetRoles: string[]): number | null {
  const titleTokens = roleTokens(title);
  if (titleTokens.length === 0) return null;

  let best: number | null = null;
  for (const role of targetRoles || []) {
    const tokens = roleTokens(role);
    if (tokens.length === 0) continue;
    const hits = tokens.filter((token) => titleTokens.includes(token)).length;
    const ratio = hits / tokens.length;
    if (best === null || ratio > best) best = ratio;
  }
  return best;
}

/**
 * Orders jobs by title/role signal alone - no network, no descriptions - so
 * only the most promising DESCRIPTION_FETCH_LIMIT postings get fetched.
 */
export function rankJobsCheaply(jobs: JobListing[], resume?: ParsedResume): JobListing[] {
  if (!resume) return [...jobs];
  const targets = [...(resume.target_roles || []), ...(resume.suggested_search_keywords || [])];

  return [...jobs]
    .map((job, index) => ({ job, index, score: roleAlignment(job.title, targets) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.job);
}

/**
 * Fetches real posting bodies for the top-ranked jobs and replaces their
 * inferred requirements with skills stated in the posting. Jobs whose fetch
 * fails keep the title-inferred fallback and stay marked as such.
 */
export async function enrichJobsWithDescriptions(
  jobs: JobListing[],
  resume?: ParsedResume,
  options: { limit?: number; concurrency?: number; budgetMs?: number; timeoutMs?: number } = {}
): Promise<JobListing[]> {
  const limit = options.limit ?? DESCRIPTION_FETCH_LIMIT;
  const concurrency = options.concurrency ?? DESCRIPTION_FETCH_CONCURRENCY;
  const budgetMs = options.budgetMs ?? DESCRIPTION_FETCH_BUDGET_MS;
  const timeoutMs = options.timeoutMs ?? DESCRIPTION_FETCH_TIMEOUT_MS;

  if (jobs.length === 0) return jobs;

  const ranked = rankJobsCheaply(jobs, resume);
  const targets = new Set(ranked.slice(0, limit).map((job) => job.id));
  const deadline = Date.now() + budgetMs;

  const toFetch = jobs.filter((job) => targets.has(job.id));
  const details = await mapWithConcurrency(toFetch, concurrency, async (job) => {
    if (Date.now() >= deadline) return null; // out of budget - keep the fallback
    const remaining = Math.max(1, Math.min(timeoutMs, deadline - Date.now()));
    return fetchJobPostingDetail(job.id, remaining);
  });

  const detailById = new Map<string, JobPostingDetail | null>();
  toFetch.forEach((job, index) => detailById.set(job.id, details[index]));

  return jobs.map((job) => {
    const detail = detailById.get(job.id);
    if (!detail) {
      // Named fallback path: this job's posting body was unavailable, so keep
      // (or derive) title-inferred requirements and mark them as inferred.
      const fallbackSkills =
        job.skills_required && job.skills_required.length > 0
          ? job.skills_required
          : inferSkillsFromTitle(job.title);
      return { ...job, skills_required: fallbackSkills, requirements_source: "inferred" as const };
    }

    return {
      ...job,
      description: detail.description,
      // Real stated requirements. An empty list means the posting named none we
      // recognize - honest emptiness beats inventing requirements it never listed.
      skills_required: detail.skills,
      requirements_source: "posting" as const,
      posting_seniority_level: detail.seniority,
      employment_type: detail.employment_type,
    };
  });
}

/**
 * Directly queries LinkedIn's official public guest jobs search endpoint
 * for verified, 100% active LinkedIn job postings with genuine /jobs/view/{id} links.
 *
 * The search endpoint returns title / company / location only, so requirements
 * start out title-inferred and are replaced by enrichJobsWithDescriptions.
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
        headers: LINKEDIN_GUEST_HEADERS,
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
          // The search endpoint carries no posting body; enrichment fills this in.
          description: "",
          apply_url: `https://www.linkedin.com/jobs/view/${urn}`,
          company_apply_url: companyUrl,
          skills_required: inferSkillsFromTitle(title),
          requirements_source: "inferred",
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
    // Not a scraped posting, so its requirements are never "posting"-sourced.
    requirements_source: "inferred" as const,
    experience_level: item.experience_level || "Mid-Senior level",
  }));
}

/**
 * Searches LinkedIn jobs.
 * Primary: Live LinkedIn public guest jobs endpoint (100% real active jobs + direct links),
 *          enriched with real posting bodies from the per-job guest endpoint.
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
      // 2. Replace inferred requirements with the real posting bodies.
      const enriched = await enrichJobsWithDescriptions(liveJobs, resume);
      const withRealRequirements = enriched.filter((job) => job.requirements_source === "posting").length;
      console.log(
        `[LinkedIn-Live] Retrieved ${enriched.length} live jobs; ${withRealRequirements} with real posting requirements ` +
          `(cache: ${JSON.stringify(getPostingCacheStats())}).`
      );
      return enriched;
    }
  } catch (err) {
    console.warn("[LinkedIn-Live] Guest scraper encountered an error, using AI discovery:", err);
  }

  // 3. Fallback to AI Job Discovery
  console.log("[LinkedIn-Fallback] Falling back to AI real-time discovery engine...");
  return await discoverJobsWithAI(filters, resume);
}

/* ------------------------------------------------------------------ *
 * Fit scoring
 * ------------------------------------------------------------------ */

/**
 * Signal weights. The score is the weighted mean over the signals a job
 * actually has evidence for, scaled to 0-100 - so a job with no usable skills
 * data is scored on what is known rather than being handed a default ratio.
 */
const SKILL_SIGNAL_WEIGHT = 60;
const ROLE_SIGNAL_WEIGHT = 25;
const SENIORITY_SIGNAL_WEIGHT = 15;

/**
 * Applied when a job carries no usable requirements at all. Without it, a
 * posting with a matching title and no stated skills would score the same as
 * one whose every stated requirement the candidate meets - missing evidence
 * must not be free. Halving keeps an unverified posting mid-pack: it cannot
 * outrank a job whose stated requirements the candidate actually meets, and it
 * is not buried either, because nothing is known against it.
 */
const LOW_CONFIDENCE_SCORE_FACTOR = 0.5;

/** LinkedIn's own seniority bands, as an ordinal scale. */
const LINKEDIN_SENIORITY_RANK: Record<string, number> = {
  internship: 0,
  "entry level": 1,
  associate: 2,
  "mid senior level": 3,
  director: 4,
  executive: 5,
};

/** ParsedResume seniority mapped onto the same scale. */
const RESUME_SENIORITY_RANK: Record<string, number> = {
  "entry level": 1,
  "mid level": 3,
  senior: 3.5,
  "lead manager": 4,
  executive: 5,
};

function rankFrom(table: Record<string, number>, raw?: string): number | undefined {
  if (!raw) return undefined;
  return table[normalizeSkillTokens(raw).join(" ")];
}

/** 0-1 seniority agreement, or null when the posting states no seniority. */
function seniorityAlignment(job: JobListing, resume: ParsedResume): number | null {
  const jobRank = rankFrom(LINKEDIN_SENIORITY_RANK, job.posting_seniority_level);
  const resumeRank = rankFrom(RESUME_SENIORITY_RANK, resume.seniority_level);
  if (jobRank === undefined || resumeRank === undefined) return null;

  const distance = Math.abs(jobRank - resumeRank);
  if (distance <= 0.5) return 1;
  if (distance <= 1) return 0.6;
  if (distance <= 2) return 0.25;
  return 0;
}

/**
 * Calculates candidate fit, match score, strengths, and missing skills.
 *
 * Skill comparison is token-boundary based (see skillsAreEquivalent), the score
 * uses the full 0-100 range, and jobs without usable requirements data are
 * reported as low confidence instead of being given a default skill ratio.
 */
export function scoreJobsWithResume(
  jobs: JobListing[],
  resume: ParsedResume
): JobListing[] {
  const candidateSkills = resume.extracted_skills || [];

  return jobs
    .map((job) => {
      const jobSkills = job.skills_required || [];
      const matched: string[] = [];
      const missing: string[] = [];

      jobSkills.forEach((skill) => {
        const isMatched = candidateSkills.some((candidateSkill) =>
          skillsAreEquivalent(candidateSkill, skill)
        );
        if (isMatched) {
          matched.push(skill);
        } else {
          missing.push(skill);
        }
      });

      const hasSkillsData = jobSkills.length > 0 && candidateSkills.length > 0;
      const skillRatio = hasSkillsData ? matched.length / jobSkills.length : null;
      const roleRatio = roleAlignment(job.title, [
        ...(resume.target_roles || []),
        ...(resume.suggested_search_keywords || []),
      ]);
      const seniorityRatio = seniorityAlignment(job, resume);

      // Weighted mean across available signals only.
      const signals: Array<[number, number]> = [];
      if (skillRatio !== null) signals.push([SKILL_SIGNAL_WEIGHT, skillRatio]);
      if (roleRatio !== null) signals.push([ROLE_SIGNAL_WEIGHT, roleRatio]);
      if (seniorityRatio !== null) signals.push([SENIORITY_SIGNAL_WEIGHT, seniorityRatio]);

      const totalWeight = signals.reduce((sum, [weight]) => sum + weight, 0);
      const weighted = signals.reduce((sum, [weight, value]) => sum + weight * value, 0);
      const rawScore = totalWeight > 0 ? (weighted / totalWeight) * 100 : 0;
      const score = Math.round(skillRatio === null ? rawScore * LOW_CONFIDENCE_SCORE_FACTOR : rawScore);

      // Confidence reflects the evidence behind the score, not the score itself.
      const confidence: "high" | "medium" | "low" = !hasSkillsData
        ? "low"
        : job.requirements_source === "posting"
          ? "high"
          : "medium";

      const matchReasons: string[] = [];
      if (matched.length > 0) {
        const label = job.requirements_source === "posting" ? "stated requirements" : "inferred requirements";
        matchReasons.push(
          `Matches ${matched.length} of ${jobSkills.length} ${label}: ${matched.slice(0, 4).join(", ")}`
        );
      }
      if (roleRatio !== null && roleRatio >= 0.6 && resume.target_roles?.length) {
        matchReasons.push(`Role title aligns with your target trajectory (${resume.target_roles[0]})`);
      }
      if (seniorityRatio !== null && seniorityRatio >= 0.6 && job.posting_seniority_level) {
        matchReasons.push(
          `Posting seniority (${job.posting_seniority_level}) fits your ${resume.seniority_level} profile`
        );
      }
      if (!hasSkillsData) {
        matchReasons.push("No requirements listed on the posting - scored on title and seniority only");
      } else if (job.requirements_source !== "posting") {
        matchReasons.push("Requirements inferred from the job title - the LinkedIn posting body was unavailable");
      }

      return {
        ...job,
        match_score: score,
        match_confidence: confidence,
        match_reasons: matchReasons,
        missing_skills: missing,
      };
    })
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
}
