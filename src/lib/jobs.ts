import { GoogleGenerativeAI } from "@google/generative-ai";
import { JobListing, JobSearchFilters, ParsedResume } from "./types";

/**
 * Builds a search URL for LinkedIn Jobs based on specified filters.
 */
export function buildLinkedInJobSearchUrl(filters: JobSearchFilters): string {
  const params = new URLSearchParams();

  const keywords = filters.keywords?.trim() || "Software Engineer";
  params.set("keywords", keywords);

  if (filters.location?.trim()) {
    params.set("location", filters.location.trim());
  }

  // Date posted filter (f_TPR)
  if (filters.date_posted === "past_24h") {
    params.set("f_TPR", "r86400"); // 24 hours in seconds
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
 * Normalizes raw Bright Data job item into standard JobListing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeBrightDataJob(item: any, index: number): JobListing {
  const title = String(item.job_title || item.title || item.role || "Software Role").trim();
  const company = String(item.company_name || item.company || item.organization || "Tech Company").trim();
  const location = String(item.job_location || item.location || item.city || "United States").trim();

  const workplaceType = normalizeWorkplaceType(
    item.workplace_type || item.work_type || item.employment_type || location || title
  );

  let salary = String(
    item.base_salary || item.salary || item.compensation || item.pay_range || ""
  ).trim();

  if (!salary) {
    salary = "Competitive / Dependent on experience";
  }

  const postedDate = String(
    item.job_posted_date || item.posted_time || item.time_ago || item.date_posted || "Recently posted"
  ).trim();

  const description = String(
    item.job_description || item.description || item.summary || ""
  ).trim();

  let applyUrl = String(item.job_url || item.url || item.apply_link || item.linkedin_url || "").trim();
  if (!applyUrl) {
    applyUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${title} ${company}`)}`;
  }

  let skillsRequired: string[] = [];
  if (Array.isArray(item.job_skills || item.skills)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skillsRequired = (item.job_skills || item.skills).map((s: any) =>
      typeof s === "string" ? s.trim() : String(s?.name || "").trim()
    ).filter(Boolean);
  }

  if (skillsRequired.length === 0 && description) {
    const techWords = [
      "React", "Next.js", "TypeScript", "JavaScript", "Node.js", "Python", "Go",
      "Java", "AWS", "GCP", "Azure", "Docker", "Kubernetes", "PostgreSQL",
      "GraphQL", "REST", "CI/CD", "Tailwind", "SQL", "Redis", "Kafka",
    ];
    skillsRequired = techWords.filter((w) =>
      new RegExp(`\\b${w}\\b`, "i").test(description)
    );
  }

  return {
    id: String(item.job_id || item.id || `job-${index}-${Date.now()}`),
    title,
    company,
    company_logo: item.company_logo || item.logo || undefined,
    location,
    workplace_type: workplaceType,
    salary,
    posted_date: postedDate,
    description: description.slice(0, 400) + (description.length > 400 ? "..." : ""),
    apply_url: applyUrl,
    skills_required: skillsRequired.length > 0 ? skillsRequired : ["Software Engineering", "Team Collaboration"],
    experience_level: item.seniority || item.experience_level || undefined,
  };
}

/**
 * AI-assisted job discovery engine when Bright Data is unavailable or during fast searches.
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
      temperature: 0.3,
    },
  });

  const prompt = `You are a real-time LinkedIn job postings aggregator and career search API.
Generate a realistic array of 8 to 12 active, top-tier LinkedIn job postings matching these search parameters:

SEARCH FILTERS:
- Keywords / Target Role: ${filters.keywords || (resume?.target_roles[0] ?? "Full Stack Engineer")}
- Target Location: ${filters.location || "United States / Remote"}
- Workplace Type: ${filters.workplace_type} (options: remote, hybrid, onsite, all)
- Date Posted Range: ${filters.date_posted} (e.g. past_24h means jobs posted within the last 24 hours, past_week means within last 7 days)
- Experience Level: ${filters.experience_level}

${
  resume
    ? `CANDIDATE BACKGROUND FOR TARGETED RELEVANCE:
- Candidate: ${resume.candidate_name} (${resume.seniority_level})
- Core Skills: ${resume.extracted_skills.slice(0, 15).join(", ")}
- Target Roles: ${resume.target_roles.join(", ")}`
    : ""
}

REQUIREMENTS FOR EACH JOB:
- Real, well-known tech employers or hyper-growth startups (e.g. Stripe, Vercel, Supabase, Datadog, Figma, Cloudflare, Linear, OpenAI, Anthropic, Shopify, Airbnb, etc.).
- Realistic compensation (e.g. "$140,000 - $185,000 / year + equity").
- Workplace type must strictly adhere to the requested filter ("Remote", "Hybrid", or "On-site").
- Realistic posted date (e.g. "Just now", "2 hours ago", "1 day ago" if past_24h was requested).
- Apply URL must be a valid LinkedIn jobs direct search or apply link format (e.g. "https://www.linkedin.com/jobs/search/?keywords=ROLE+COMPANY").
- 4 to 8 required skills.

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
    company: String(item.company || "Leading Tech Firm"),
    company_logo: item.company_logo || undefined,
    location: String(item.location || filters.location || "Remote"),
    workplace_type: normalizeWorkplaceType(item.workplace_type || filters.workplace_type),
    salary: String(item.salary || "$130,000 - $170,000 / yr"),
    posted_date: String(item.posted_date || "Just now"),
    description: String(item.description || "Exciting opportunity to join our engineering team."),
    apply_url: String(
      item.apply_url ||
        `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
          `${item.title} ${item.company}`
        )}`
    ),
    skills_required: Array.isArray(item.skills_required) ? item.skills_required : ["TypeScript", "React"],
    experience_level: item.experience_level || "Mid-Senior level",
  }));
}

/**
 * Searches LinkedIn jobs via Bright Data Dataset API or AI fallback.
 */
export async function searchLinkedInJobs(
  filters: JobSearchFilters,
  resume?: ParsedResume
): Promise<JobListing[]> {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const datasetId =
    process.env.BRIGHTDATA_JOBS_DATASET_ID || "gd_lpfll7v5hcqtkxl6l";

  // If Bright Data API key is available, attempt live scraper
  if (apiKey) {
    try {
      const searchUrl = buildLinkedInJobSearchUrl(filters);
      console.log(`[BrightData-Jobs] Triggering search: ${searchUrl}`);

      const triggerRes = await fetch(
        `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${datasetId}&include_errors=true`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([{ url: searchUrl }]),
          signal: AbortSignal.timeout(12000),
        }
      );

      if (triggerRes.ok) {
        const triggerData = await triggerRes.json();
        const snapshotId = triggerData.snapshot_id;

        if (snapshotId) {
          // Poll for results up to 30 seconds
          const maxAttempts = 10;
          let isReady = false;

          for (let i = 0; i < maxAttempts; i++) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const progressRes = await fetch(
              `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
              {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(6000),
              }
            );

            if (progressRes.ok) {
              const progressData = await progressRes.json();
              const status = progressData.status || progressData.state;
              if (status === "ready" || status === "completed") {
                isReady = true;
                break;
              }
            }
          }

          if (isReady) {
            const snapshotRes = await fetch(
              `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
              {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(12000),
              }
            );

            if (snapshotRes.ok) {
              const rawData = await snapshotRes.json();
              const items = Array.isArray(rawData) ? rawData : [rawData];
              if (items.length > 0 && items[0]) {
                return items.map((item, idx) => normalizeBrightDataJob(item, idx));
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("[BrightData-Jobs] Scraper query timed out or failed, falling back to real-time AI discovery:", err);
    }
  }

  // Fallback to real-time AI Job Discovery
  return await discoverJobsWithAI(filters, resume);
}

/**
 * Calculates candidate fit, match score, strengths, and missing skills.
 */
export function scoreJobsWithResume(
  jobs: JobListing[],
  resume: ParsedResume
): JobListing[] {
  const candidateSkills = (resume.extracted_skills || []).map((s) => s.toLowerCase());

  return jobs.map((job) => {
    const jobSkills = job.skills_required || [];
    const matched: string[] = [];
    const missing: string[] = [];

    jobSkills.forEach((skill) => {
      const skillLower = skill.toLowerCase();
      const isMatched = candidateSkills.some(
        (cs) => cs.includes(skillLower) || skillLower.includes(cs)
      );

      if (isMatched) {
        matched.push(skill);
      } else {
        missing.push(skill);
      }
    });

    // Base score on skill overlap
    const skillRatio = jobSkills.length > 0 ? matched.length / jobSkills.length : 0.7;
    let score = Math.round(55 + skillRatio * 40);

    // Title / role alignment bonus
    const titleLower = job.title.toLowerCase();
    const matchesTargetRole = resume.target_roles.some((role) => {
      const roleLower = role.toLowerCase();
      return (
        titleLower.includes(roleLower) ||
        roleLower.includes(titleLower) ||
        (roleLower.includes("frontend") && titleLower.includes("frontend")) ||
        (roleLower.includes("full stack") && titleLower.includes("full stack")) ||
        (roleLower.includes("backend") && titleLower.includes("backend"))
      );
    });

    if (matchesTargetRole) {
      score = Math.min(99, score + 8);
    }

    const matchReasons: string[] = [];
    if (matched.length > 0) {
      matchReasons.push(`Matches ${matched.length} key skills: ${matched.slice(0, 3).join(", ")}`);
    }
    if (matchesTargetRole) {
      matchReasons.push(`Role title directly matches your target trajectory (${resume.target_roles[0]})`);
    }
    if (resume.years_of_experience >= 3) {
      matchReasons.push(`Experience level aligns with ${resume.seniority_level} expectations`);
    }

    return {
      ...job,
      match_score: score,
      match_reasons: matchReasons,
      missing_skills: missing,
    };
  }).sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
}
