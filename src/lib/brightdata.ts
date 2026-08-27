import { ProfileData } from "./types";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Direct rule-based normalizer for Bright Data LinkedIn scraper format.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeBrightDataDirect(rawItem: any): ProfileData {
  if (!rawItem || typeof rawItem !== "object") {
    throw new Error("Invalid raw data returned from scraper.");
  }

  // 1. Name
  let firstName = String(rawItem.first_name || "").trim();
  let lastName = String(rawItem.last_name || "").trim();
  const fullName = String(rawItem.name || rawItem.full_name || "").trim();

  if (!firstName && !lastName && fullName) {
    const parts = fullName.split(" ");
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }

  // 2. Headline, Title, Company & Location
  let headline = String(
    rawItem.position ||
      rawItem.headline ||
      rawItem.sub_title ||
      rawItem.current_title ||
      ""
  ).trim();

  const currentCompany = String(
    rawItem.current_company_name ||
      rawItem.current_company?.name ||
      (typeof rawItem.current_company === "string" ? rawItem.current_company : "") ||
      ""
  ).trim();

  let currentTitle = String(
    rawItem.current_company?.title ||
      rawItem.current_job_title ||
      rawItem.current_title ||
      ""
  ).trim();

  if (!currentTitle && headline) {
    currentTitle = headline.includes(" at ") ? headline.split(" at ")[0].trim() : headline;
  }

  const about = String(
    rawItem.about || rawItem.summary || rawItem.description || rawItem.bio || ""
  ).trim();

  // Try extracting title from about text if still missing
  if (!currentTitle && about) {
    const match = about.match(/^(?:As\s+)?([a-zA-Z\s&,]+?)(?:\s+at|\s+of|\s+for)\s+/i);
    if (match && match[1] && match[1].length < 40) {
      currentTitle = match[1].trim();
    }
  }

  if (!headline) {
    if (currentTitle && currentCompany) {
      headline = `${currentTitle} at ${currentCompany}`;
    } else if (currentTitle) {
      headline = currentTitle;
    } else if (currentCompany) {
      headline = `Professional at ${currentCompany}`;
    }
  }

  const location = String(
    rawItem.city ||
      rawItem.location ||
      (rawItem.country_code ? `${rawItem.city || ""}, ${rawItem.country_code}` : "") ||
      ""
  ).trim();

  // 3. Work Experience Array
  const rawExperience =
    rawItem.experience ||
    rawItem.work_experience ||
    rawItem.positions ||
    [];

  const experience: ProfileData["experience"] = Array.isArray(rawExperience)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawExperience.map((exp: any) => {
        const company = String(
          exp.company || exp.company_name || exp.organization || ""
        ).trim();
        const title = String(exp.title || exp.role || exp.position || "").trim();
        const duration = String(
          exp.duration ||
            exp.dates ||
            (exp.start_date && exp.end_date
              ? `${exp.start_date} - ${exp.end_date}`
              : exp.start_date || "")
        ).trim();
        const description = String(
          exp.description || exp.summary || exp.description_html || ""
        ).trim();

        return { company, title, duration, description };
      }).filter((e) => e.company || e.title)
    : [];

  // If experience is empty but current company/role is known, create primary current position
  if (experience.length === 0 && (currentCompany || currentTitle)) {
    experience.push({
      company: currentCompany || "Current Organization",
      title: currentTitle || "Leader / Professional",
      duration: "Present",
      description: about ? (about.length > 250 ? `${about.slice(0, 247)}...` : about) : `Active role at ${currentCompany || "the company"}.`,
    });
  }

  // 4. Education Array
  const rawEducation =
    rawItem.education || rawItem.educations || rawItem.schools || [];

  const education: ProfileData["education"] = Array.isArray(rawEducation)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawEducation.map((edu: any) => {
        const school = String(
          edu.school || edu.school_name || edu.title || edu.institution || ""
        ).trim();
        const degree = String(
          [edu.degree, edu.field].filter(Boolean).join(" in ") ||
            edu.degree_name ||
            edu.field_of_study ||
            ""
        ).trim();
        const years = String(
          edu.years ||
            edu.dates ||
            (edu.start_year && edu.end_year
              ? `${edu.start_year} - ${edu.end_year}`
              : edu.start_year || edu.end_year || "")
        ).trim();

        return { school, degree, years };
      }).filter((e) => e.school || e.degree)
    : [];

  // Fallback for single education details string
  if (education.length === 0 && rawItem.educations_details && typeof rawItem.educations_details === "string") {
    education.push({
      school: rawItem.educations_details.trim(),
      degree: "Alumni / Degree",
      years: "",
    });
  }

  // 5. Projects, Posts & Publications
  const rawProjects =
    rawItem.projects ||
    rawItem.posts ||
    rawItem.activity ||
    rawItem.featured_projects ||
    [];

  const projects: ProfileData["projects"] = Array.isArray(rawProjects)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawProjects.slice(0, 8).map((p: any) => ({
        name: String(p.name || p.title || p.project_name || "").trim(),
        description: String(p.description || p.attribution || p.summary || "").trim(),
      })).filter((p) => p.name)
    : [];

  // 6. Certifications & Honors / Awards
  const rawCerts =
    rawItem.certifications ||
    rawItem.honors_and_awards ||
    rawItem.licenses_and_certifications ||
    [];

  const certifications: ProfileData["certifications"] = Array.isArray(rawCerts)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawCerts.map((c: any) => ({
        name: String(c.name || c.title || c.certification_name || "").trim(),
        issuer: String(c.issuer || c.organization || c.authority || "").trim(),
        date: String(c.date || c.issued_date || c.issue_date || "").trim(),
      })).filter((c) => c.name)
    : [];

  // 7. Skills
  const rawSkills = rawItem.skills || rawItem.languages || [];
  const skills: string[] = Array.isArray(rawSkills)
    ? rawSkills
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => (typeof s === "string" ? s.trim() : String(s?.name || s?.title || "").trim()))
        .filter(Boolean)
    : [];

  return {
    first_name: firstName,
    last_name: lastName,
    headline,
    current_company: currentCompany,
    current_title: currentTitle,
    location,
    about,
    education,
    experience,
    projects,
    certifications,
    skills,
  };
}

/**
 * Uses Gemini AI to infer professional skills and technologies from rich profile context
 * when public scraper data omits explicit skill tags.
 */
async function enrichSkills(profile: ProfileData): Promise<string[]> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";
  if (!apiKey) return profile.skills;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const context = `
Candidate Name: ${profile.first_name} ${profile.last_name}
Headline: ${profile.headline}
Current Role: ${profile.current_title} at ${profile.current_company}
About: ${profile.about}
Experience History: ${profile.experience.map((e) => `${e.title} at ${e.company} (${e.duration}): ${e.description}`).join("; ")}
Education: ${profile.education.map((e) => `${e.degree} at ${e.school}`).join("; ")}
Projects / Publications: ${profile.projects.map((p) => `${p.name}: ${p.description}`).join("; ")}
`;

    const prompt = `Based on the following professional profile details, extract and identify a list of 8 to 15 relevant technical, industry, leadership, and domain skills. Return ONLY a JSON array of strings, e.g. ["Skill 1", "Skill 2", ...].

PROFILE DETAILS:
${context}`;

    const res = await model.generateContent(prompt);
    const text = res.response.text();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((s) => String(s).trim()).filter(Boolean);
    }
  } catch (err) {
    console.warn("[BrightData] Skills AI enrichment skipped:", err);
  }
  return profile.skills;
}

/**
 * Normalizes Bright Data's output with automated skill enrichment.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function normalizeBrightDataProfile(rawItem: any): Promise<ProfileData> {
  const result = normalizeBrightDataDirect(rawItem);

  // If skills are empty, enrich using Gemini AI from work history and background
  if (!result.skills || result.skills.length === 0) {
    console.log("[BrightData] Inferring professional skills from profile background...");
    result.skills = await enrichSkills(result);
  }

  return result;
}

/**
 * Triggers and fetches structured profile data from any LinkedIn/Web URL using Bright Data API.
 */
export async function extractProfileFromUrl(targetUrl: string): Promise<ProfileData> {
  const apiKey =
    process.env.BRIGHTDATA_API_KEY || "f3fc32db-47d8-4117-81d7-b224ec63f965";
  const datasetId =
    process.env.BRIGHTDATA_DATASET_ID || "gd_l1viktl72bvl7bjuj0";

  if (!apiKey) {
    throw new Error(
      "Bright Data API key is not configured. Please set BRIGHTDATA_API_KEY in your environment variables."
    );
  }

  // Format and validate target URL
  let cleanUrl = targetUrl.trim();
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    cleanUrl = `https://${cleanUrl}`;
  }

  console.log(`[BrightData] Initiating URL extraction for: ${cleanUrl}`);

  // Step 1: Trigger Async Snapshot Collection
  const triggerRes = await fetch(
    `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${datasetId}&include_errors=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ url: cleanUrl }]),
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!triggerRes.ok) {
    const errorText = await triggerRes.text();
    console.error("[BrightData] Trigger error:", triggerRes.status, errorText);
    throw new Error(
      `Bright Data scraper trigger failed (${triggerRes.status}): ${errorText || "Please verify your API key and URL."}`
    );
  }

  const triggerData = await triggerRes.json();
  const snapshotId = triggerData.snapshot_id;

  if (!snapshotId) {
    throw new Error("Bright Data did not return a snapshot ID for this request.");
  }

  console.log(`[BrightData] Snapshot triggered successfully. Snapshot ID: ${snapshotId}. Polling progress...`);

  // Step 2: Poll Progress until status is ready (Max 45 seconds)
  const maxAttempts = 18;
  const pollIntervalMs = 2500;
  let isReady = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    try {
      const progressRes = await fetch(
        `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(8000),
        }
      );

      if (progressRes.ok) {
        const progressData = await progressRes.json();
        const status = progressData.status || progressData.state;
        console.log(`[BrightData] Poll attempt ${attempt}/${maxAttempts}: status = ${status}`);

        if (status === "ready" || status === "completed" || status === "done") {
          isReady = true;
          break;
        }

        if (status === "failed" || status === "error") {
          throw new Error("Bright Data scraping job failed. The profile may be private or inaccessible.");
        }
      }
    } catch (pollErr: unknown) {
      if (pollErr instanceof Error && pollErr.message.includes("failed")) {
        throw pollErr;
      }
      console.warn(`[BrightData] Poll check attempt ${attempt} warning:`, pollErr);
    }
  }

  if (!isReady) {
    throw new Error(
      "Bright Data scraping job timed out while collecting profile data. Please verify the URL and try again."
    );
  }

  // Step 3: Download Snapshot Data
  const snapshotRes = await fetch(
    `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!snapshotRes.ok) {
    const errorText = await snapshotRes.text();
    throw new Error(`Failed to download scraped data from Bright Data: ${errorText}`);
  }

  const resultData = await snapshotRes.json();
  const rawItem = Array.isArray(resultData) ? resultData[0] : resultData;

  if (!rawItem) {
    throw new Error("No profile data found at the provided URL. Please check the link.");
  }

  // Return normalized profile with automated skills enrichment
  return await normalizeBrightDataProfile(rawItem);
}
