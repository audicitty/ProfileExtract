/**
 * Fetches, caches, and parses real job posting bodies from LinkedIn's per-job
 * public guest endpoint (`jobs-guest/jobs/api/jobPosting/{id}`).
 *
 * The guest *search* endpoint only returns title / company / location, so before
 * this module existed nothing in the system held real requirements text. See
 * CLAUDE.md §7 item 6 and idea.md §7.2.
 *
 * Pacing constants below are measured, not guessed. The guest API enforces a
 * burst limit shared between search and per-job calls: concurrency 3 draws 429s,
 * while concurrency 2 with a 400ms gap and a single backoff retry completed 25/25.
 */

/** Descriptions are only fetched for the top slice of the cheap ranking. */
export const JOB_DESCRIPTION_FETCH_LIMIT = 25;
/** Parallel in-flight requests. 3 reliably trips LinkedIn's burst limiter. */
export const JOB_DESCRIPTION_CONCURRENCY = 2;
/** Per-request timeout, matching the existing guest-search fetch. */
export const JOB_DESCRIPTION_TIMEOUT_MS = 9000;
/** Pause a worker takes between requests. */
export const JOB_DESCRIPTION_GAP_MS = 400;
/** Backoff before the single retry allowed on a 429. */
export const JOB_DESCRIPTION_RETRY_DELAY_MS = 1500;
/** Ceiling on the whole enrichment pass, so a slow LinkedIn cannot hang the route. */
export const JOB_DESCRIPTION_TOTAL_BUDGET_MS = 25000;
/**
 * How long a fetched posting body stays cached.
 * Posting bodies are effectively immutable once published, so this trades a
 * small staleness risk for a large reduction in requests from one IP.
 */
export const JOB_DESCRIPTION_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
/** Bound on cache size so a long-lived server process cannot grow without limit. */
export const JOB_DESCRIPTION_CACHE_MAX_ENTRIES = 500;
/** Descriptions are truncated before they reach any model or the client. */
export const MAX_DESCRIPTION_CHARS = 5000;
/** Most skills parsed out of a single posting. */
export const MAX_PARSED_SKILLS = 8;

const JOB_POSTING_ENDPOINT = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting";

const GUEST_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
};

export interface JobDescriptionResult {
  id: string;
  /** Plain text. Never HTML — nothing downstream should receive markup. */
  text: string;
  /** Skills found in the posting body, ordered by prominence. */
  skills: string[];
  /** "Seniority level" from the posting's criteria block, when present. */
  seniority?: string;
  /** "Employment type" from the posting's criteria block, when present. */
  employment_type?: string;
}

/* -------------------------------------------------------------------------- */
/* HTML to text                                                               */
/* -------------------------------------------------------------------------- */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/**
 * Converts a posting's HTML body into plain text, preserving line structure so
 * bullet lists stay readable.
 */
export function stripHtmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Pulls the description container out of a posting page, honouring nesting so a
 * `<div>` inside the body does not truncate it.
 */
function extractDescriptionHtml(pageHtml: string): string | null {
  const open = pageHtml.search(/<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>/i);
  if (open === -1) return null;

  const tagEnd = pageHtml.indexOf(">", open);
  if (tagEnd === -1) return null;

  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = tagEnd + 1;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(pageHtml)) !== null) {
    depth += match[1] === "/" ? -1 : 1;
    if (depth === 0) return pageHtml.slice(tagEnd + 1, match.index);
  }

  return pageHtml.slice(tagEnd + 1);
}

/** Reads the "Seniority level" / "Employment type" pairs from the criteria block. */
function extractCriteria(pageHtml: string): Record<string, string> {
  const criteria: Record<string, string> = {};
  const re =
    /<h3[^>]*description__job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>\s*<span[^>]*description__job-criteria-text[^>]*>([\s\S]*?)<\/span>/gi;

  let match: RegExpExecArray | null;
  while ((match = re.exec(pageHtml)) !== null) {
    const key = stripHtmlToText(match[1]).toLowerCase();
    const value = stripHtmlToText(match[2]);
    if (key && value) criteria[key] = value;
  }

  return criteria;
}

/** Parses a fetched posting page into text, skills, and criteria. */
export function parseJobPostingPage(id: string, pageHtml: string): JobDescriptionResult | null {
  const descriptionHtml = extractDescriptionHtml(pageHtml);
  if (!descriptionHtml) return null;

  const text = stripHtmlToText(descriptionHtml).slice(0, MAX_DESCRIPTION_CHARS);
  if (text.length < 40) return null;

  const criteria = extractCriteria(pageHtml);

  return {
    id,
    text,
    skills: parseSkillsFromText(text),
    seniority: criteria["seniority level"],
    employment_type: criteria["employment type"],
  };
}

/* -------------------------------------------------------------------------- */
/* Skill extraction                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Canonical skill names with their surface forms. Deliberately a flat lookup
 * table rather than a taxonomy — idea.md §7.3 defers ESCO/O*NET until after this
 * phase proves real descriptions help.
 */
const SKILL_VOCABULARY: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["JavaScript", ["javascript", "java script", "ecmascript"]],
  ["TypeScript", ["typescript", "type script"]],
  ["React", ["react", "react.js", "reactjs"]],
  ["Next.js", ["next.js", "nextjs"]],
  ["Angular", ["angular", "angularjs"]],
  ["Vue.js", ["vue", "vue.js", "vuejs"]],
  ["Node.js", ["node.js", "nodejs", "node js"]],
  ["Express.js", ["express", "express.js", "expressjs"]],
  ["HTML", ["html", "html5"]],
  ["CSS", ["css", "css3"]],
  ["Tailwind CSS", ["tailwind", "tailwind css"]],
  ["Redux", ["redux"]],
  ["Java", ["java", "core java"]],
  ["Spring Boot", ["spring boot", "springboot", "spring"]],
  ["Kotlin", ["kotlin"]],
  ["Python", ["python"]],
  ["Django", ["django"]],
  ["Flask", ["flask"]],
  ["FastAPI", ["fastapi", "fast api"]],
  ["Go", ["golang", "go lang"]],
  ["Rust", ["rust"]],
  ["Ruby on Rails", ["ruby on rails", "rails", "ruby"]],
  ["PHP", ["php", "laravel"]],
  ["C++", ["c++", "cpp"]],
  ["C#", ["c#", "csharp"]],
  [".NET", [".net", "dotnet", "asp.net"]],
  ["Swift", ["swift"]],
  ["Objective-C", ["objective-c", "objective c"]],
  ["Android", ["android"]],
  ["iOS", ["ios"]],
  ["React Native", ["react native"]],
  ["Flutter", ["flutter", "dart"]],
  ["SQL", ["sql"]],
  ["PostgreSQL", ["postgresql", "postgres"]],
  ["MySQL", ["mysql"]],
  ["MongoDB", ["mongodb", "mongo"]],
  ["Redis", ["redis"]],
  ["Elasticsearch", ["elasticsearch", "elastic search"]],
  ["Kafka", ["kafka"]],
  ["RabbitMQ", ["rabbitmq"]],
  ["GraphQL", ["graphql"]],
  ["REST APIs", ["rest api", "rest apis", "restful", "rest"]],
  ["gRPC", ["grpc"]],
  ["Microservices", ["microservices", "microservice"]],
  ["AWS", ["aws", "amazon web services"]],
  ["Azure", ["azure"]],
  ["Google Cloud", ["gcp", "google cloud"]],
  ["Docker", ["docker"]],
  ["Kubernetes", ["kubernetes", "k8s"]],
  ["Terraform", ["terraform"]],
  ["Jenkins", ["jenkins"]],
  ["CI/CD", ["ci/cd", "cicd", "continuous integration"]],
  ["Linux", ["linux", "unix"]],
  ["Git", ["git", "github", "gitlab"]],
  ["Machine Learning", ["machine learning"]],
  ["Deep Learning", ["deep learning"]],
  ["TensorFlow", ["tensorflow"]],
  ["PyTorch", ["pytorch"]],
  ["NLP", ["nlp", "natural language processing"]],
  ["Pandas", ["pandas"]],
  ["NumPy", ["numpy"]],
  ["Spark", ["spark", "pyspark", "apache spark"]],
  ["Hadoop", ["hadoop"]],
  ["Airflow", ["airflow"]],
  ["Tableau", ["tableau"]],
  ["Power BI", ["power bi", "powerbi"]],
  ["Data Modeling", ["data modeling", "data modelling"]],
  ["ETL", ["etl"]],
  ["Agile", ["agile", "scrum"]],
  ["Jira", ["jira"]],
  ["Automated Testing", ["unit testing", "jest", "pytest", "junit", "cypress", "selenium"]],
  ["System Design", ["system design", "distributed systems"]],
];

/** Regex-escapes a surface form and wraps it in non-word-character boundaries. */
function aliasPattern(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  // Boundaries exclude '+' and '#' so "c" cannot match inside "c++" and vice versa.
  return new RegExp(`(?<![a-z0-9+#.])${escaped}(?![a-z0-9+#])`, "gi");
}

const COMPILED_VOCABULARY = SKILL_VOCABULARY.map(([canonical, aliases]) => ({
  canonical,
  patterns: aliases.map(aliasPattern),
}));

/**
 * Finds known skills in posting text, ranked by how often they appear.
 * Purely a dictionary lookup — no model call, no network, fully deterministic.
 */
export function parseSkillsFromText(text: string): string[] {
  if (!text) return [];

  const hits: Array<{ canonical: string; count: number }> = [];

  for (const { canonical, patterns } of COMPILED_VOCABULARY) {
    let count = 0;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      count += (text.match(pattern) || []).length;
    }
    if (count > 0) hits.push({ canonical, count });
  }

  return hits
    .sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical))
    .slice(0, MAX_PARSED_SKILLS)
    .map((h) => h.canonical);
}

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

interface CacheEntry {
  value: JobDescriptionResult;
  expiresAt: number;
}

const descriptionCache = new Map<string, CacheEntry>();
let cacheHits = 0;
let cacheMisses = 0;

/** Test/diagnostic view of cache state. */
export function jobDescriptionCacheStats(): { size: number; hits: number; misses: number } {
  return { size: descriptionCache.size, hits: cacheHits, misses: cacheMisses };
}

/** Test hook — resets cache contents and counters. */
export function clearJobDescriptionCache(): void {
  descriptionCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

function readCache(id: string, now: number): JobDescriptionResult | null {
  const entry = descriptionCache.get(id);
  if (!entry) {
    cacheMisses++;
    return null;
  }
  if (entry.expiresAt <= now) {
    descriptionCache.delete(id);
    cacheMisses++;
    return null;
  }
  // Refresh insertion order so eviction drops genuinely cold entries.
  descriptionCache.delete(id);
  descriptionCache.set(id, entry);
  cacheHits++;
  return entry.value;
}

function writeCache(id: string, value: JobDescriptionResult, now: number): void {
  descriptionCache.set(id, { value, expiresAt: now + JOB_DESCRIPTION_CACHE_TTL_MS });
  while (descriptionCache.size > JOB_DESCRIPTION_CACHE_MAX_ENTRIES) {
    const oldest = descriptionCache.keys().next();
    if (oldest.done) break;
    descriptionCache.delete(oldest.value);
  }
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* -------------------------------------------------------------------------- */

export interface FetchJobDescriptionsOptions {
  /** Injected in tests so the suite never touches the network. */
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  concurrency?: number;
  budgetMs?: number;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchOneDescription(
  id: string,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>
): Promise<JobDescriptionResult | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    // One retry only, and only for 429 — the limiter clears in about a second.
    if (attempt > 0) await sleep(JOB_DESCRIPTION_RETRY_DELAY_MS);

    try {
      const res = await fetchImpl(`${JOB_POSTING_ENDPOINT}/${encodeURIComponent(id)}`, {
        headers: GUEST_HEADERS,
        signal: AbortSignal.timeout(JOB_DESCRIPTION_TIMEOUT_MS),
      });

      if (res.status === 429) continue;
      if (!res.ok) return null;

      return parseJobPostingPage(id, await res.text());
    } catch (err) {
      console.warn(`[JobDescription] Fetch failed for job ${id}:`, err);
      return null;
    }
  }

  console.warn(`[JobDescription] Rate limited on job ${id} after retry.`);
  return null;
}

/**
 * Fetches posting bodies for the given ids, honouring the cache, a concurrency
 * cap, and an overall time budget.
 *
 * Ids that fail, time out, or stay rate limited are simply absent from the
 * returned map — callers fall back per job rather than failing the whole search.
 */
export async function fetchJobDescriptions(
  ids: string[],
  options: FetchJobDescriptionsOptions = {}
): Promise<Map<string, JobDescriptionResult>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const concurrency = options.concurrency ?? JOB_DESCRIPTION_CONCURRENCY;
  const budgetMs = options.budgetMs ?? JOB_DESCRIPTION_TOTAL_BUDGET_MS;

  const results = new Map<string, JobDescriptionResult>();
  const pending: string[] = [];

  for (const id of ids) {
    const cached = readCache(id, now());
    if (cached) {
      results.set(id, cached);
    } else {
      pending.push(id);
    }
  }

  if (pending.length === 0) return results;

  const deadline = now() + budgetMs;
  let cursor = 0;

  const worker = async () => {
    while (cursor < pending.length) {
      if (now() >= deadline || options.signal?.aborted) return;

      const id = pending[cursor++];
      const parsed = await fetchOneDescription(id, fetchImpl, sleep);

      if (parsed) {
        writeCache(id, parsed, now());
        results.set(id, parsed);
      }

      if (cursor < pending.length) await sleep(JOB_DESCRIPTION_GAP_MS);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  return results;
}
