/**
 * The LLM content layer — the judgement half of the Resume Enhancer.
 *
 * idea.md §1.1 splits the work in two: the parser bench measures everything structural
 * (src/lib/resume-ats.ts), and the model judges only what cannot be measured — weak
 * verbs, unquantified bullets, buzzword padding, tense drift, summary strength, and
 * where a missing target-JD keyword could honestly go.
 *
 * Three rules this file exists to hold:
 *
 *   1. The prompt stays short. Instruction adherence degrades as rule count grows, which
 *      is the failure mode this whole design avoids. Anything Phase 3 already checks is
 *      not re-checked here, and `test/resume-enhance.test.mjs` fails the build if the
 *      prompt grows past its budget.
 *   2. The model returns findings and booleans, never a number. Scoring is TypeScript's,
 *      using bench-measured weights.
 *   3. Keyword gaps are computed here, deterministically, by token-boundary matching —
 *      the registry's own assertion for `content.keyword_gap_vs_jd`. The model is only
 *      asked where to put them.
 *
 * Structure mirrors src/lib/resume.ts: schema-enforced output, model fallback chain,
 * per-attempt timeout.
 */
import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";

import { ATS_REGISTRY, STANDARD_HEADING_KEYWORDS } from "./resume-ats";
import { normalizeSkillTokens, skillTokensMatch } from "./jobs";
import { parseSkillsFromText } from "./job-descriptions";
import type {
  BulletRewrite,
  ContentFinding,
  KeywordPlacement,
  ResumeContentReview,
} from "./types";

/** Registry ids the model is allowed to return. Anything else is dropped. */
export const LLM_CHECK_IDS = ATS_REGISTRY.checks
  .filter((check) => check.layer === "llm")
  .map((check) => check.id);

const STATEMENT_BY_ID = new Map(
  ATS_REGISTRY.checks.map((check) => [check.id, check.statement])
);

export const MAX_BULLET_REWRITES = 8;
/** How much resume and JD text reaches the model. Enough for a long CV, bounded. */
export const MAX_INPUT_CHARS = 18000;
export const ENHANCE_TIMEOUT_MS = 45000;

/* -------------------------------------------------------------------------- */
/* The prompt — the only place rules live, and it stays short on purpose       */
/* -------------------------------------------------------------------------- */

export const ENHANCE_SYSTEM_INSTRUCTION = `You review resume CONTENT. A separate deterministic layer has already checked layout, columns, headings, contact details, dates and file structure — never comment on any of those.

Judge exactly these things:

1. content.strong_action_verbs — does each bullet open with a specific action verb? Fail openings that are passive ("was responsible for"), filler ("helped with", "worked on", "assisted in"), or a bare noun phrase.

2. content.quantified_bullets — does each bullet state a measurable outcome: a number, percentage, duration, scale, or amount? A bullet that describes a duty with no result fails.

3. content.no_buzzword_padding — flag unsupported superlatives and filler in the summary and skills ("results-driven", "passionate", "synergy", "team player", "guru", "expert" with nothing behind it).

4. content.tense_consistency — past roles in past tense, the current role in present tense. Flag drift and quote the phrase.

5. Summary strength — is a summary present, and does it name the role, the years of experience, and two or three concrete skills? Return a tighter 2-3 sentence rewrite built only from facts already in the resume.

6. content.keyword_gap_vs_jd — you may be given keywords the target job needs that the resume never mentions. For each, name the section where the candidate could add it and how, grounded in experience the resume already describes. If a keyword has no honest home, say so in the suggestion. Return no placements when no keywords are given.

Return one finding per check id above, with passed=true when the resume is already fine on that check.

Rules:
- Quote the resume's own words in "excerpt". Never paraphrase into evidence.
- Invent nothing: no employer, tool, date, or achievement that is not in the text. When a bullet needs a metric the resume does not state, leave a marked placeholder such as [X%] for the candidate to fill in.
- Rewrite at most ${MAX_BULLET_REWRITES} bullets, weakest ones first, keeping each to one line.
- Return findings and booleans only. Never return a score, rating, grade, or percentage of quality — scoring happens outside this model.`;

/* -------------------------------------------------------------------------- */
/* Response schema                                                            */
/* -------------------------------------------------------------------------- */

const enhanceResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    findings: {
      type: SchemaType.ARRAY,
      description: "One entry per content check id named in the instructions.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          check_id: {
            type: SchemaType.STRING,
            description: `One of: ${LLM_CHECK_IDS.join(", ")}`,
          },
          passed: { type: SchemaType.BOOLEAN, description: "True when the resume is fine on this check" },
          section: { type: SchemaType.STRING, description: "Resume section the verdict is about" },
          excerpt: { type: SchemaType.STRING, description: "The resume's own words, quoted verbatim" },
          problem: { type: SchemaType.STRING, description: "What is wrong, in one sentence. Empty when passed" },
          fix: { type: SchemaType.STRING, description: "What to do about it, in one sentence" },
        },
        required: ["check_id", "passed", "section", "excerpt", "problem", "fix"],
      },
    },
    bullet_rewrites: {
      type: SchemaType.ARRAY,
      description: `Up to ${MAX_BULLET_REWRITES} rewritten bullets, weakest first`,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          original: { type: SchemaType.STRING, description: "The bullet exactly as written" },
          improved: { type: SchemaType.STRING, description: "The rewrite, one line, no invented facts" },
          rationale: { type: SchemaType.STRING, description: "Why the rewrite is stronger, in one sentence" },
        },
        required: ["original", "improved", "rationale"],
      },
    },
    summary_present: { type: SchemaType.BOOLEAN, description: "Does the resume have a summary or profile section" },
    summary_strong: { type: SchemaType.BOOLEAN, description: "Does it name role, years, and concrete skills" },
    summary_rewrite: { type: SchemaType.STRING, description: "2-3 sentence rewrite, or empty string" },
    keyword_placements: {
      type: SchemaType.ARRAY,
      description: "Where each supplied missing keyword could honestly be added",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          keyword: { type: SchemaType.STRING },
          section: { type: SchemaType.STRING },
          suggestion: { type: SchemaType.STRING },
        },
        required: ["keyword", "section", "suggestion"],
      },
    },
  },
  required: [
    "findings",
    "bullet_rewrites",
    "summary_present",
    "summary_strong",
    "summary_rewrite",
    "keyword_placements",
  ],
};

/* -------------------------------------------------------------------------- */
/* Deterministic helpers — no model involved                                  */
/* -------------------------------------------------------------------------- */

/**
 * Keywords a target job names that the resume never mentions.
 *
 * The registry's assertion for `content.keyword_gap_vs_jd` is a token-boundary match, so
 * this reuses the job pipeline's matcher rather than asking the model: "Java" does not
 * satisfy "JavaScript", and a gap is a gap whatever a model feels about it.
 */
export function computeKeywordGaps(
  targetJobDescription: string,
  resumeText: string
): string[] {
  const jdSkills = parseSkillsFromText(targetJobDescription || "");
  if (jdSkills.length === 0) return [];

  const resumeTokens = normalizeSkillTokens(resumeText || "");
  if (resumeTokens.length === 0) return jdSkills;

  return jdSkills.filter(
    (skill) => !skillTokensMatch(resumeTokens, normalizeSkillTokens(skill))
  );
}

/** The canonical sections a tech resume is read for. */
const EXPECTED_SECTIONS: { section: string; keywords: string[] }[] = [
  { section: "Summary", keywords: ["summary", "objective", "profile", "about me"] },
  { section: "Experience", keywords: ["experience", "employment", "work history", "career history"] },
  { section: "Education", keywords: ["education", "academics", "academic background", "qualifications"] },
  { section: "Skills", keywords: ["skills", "competencies", "core competencies", "technologies"] },
  { section: "Projects", keywords: ["projects", "portfolio"] },
  { section: "Certifications", keywords: ["certifications", "certificates", "licenses", "courses", "training"] },
];

const headingish = (line: string): string =>
  line.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Which sections the resume has, read off its own heading lines.
 *
 * Deterministic on purpose: `STANDARD_HEADING_KEYWORDS` is the same vocabulary the
 * structural layer uses, so the enhancer and the bench agree on what a heading is, and
 * the prompt does not have to carry a rule about it.
 */
export function analyzeSections(
  resumeText: string
): { section: string; present: boolean; note: string }[] {
  const lines = (resumeText || "")
    .split("\n")
    .map(headingish)
    .filter((line) => line.length > 0 && line.length <= 60);

  return EXPECTED_SECTIONS.map(({ section, keywords }) => {
    const present = lines.some((line) =>
      keywords.some(
        (keyword) =>
          STANDARD_HEADING_KEYWORDS.includes(keyword) && ` ${line} `.includes(` ${keyword} `)
      )
    );
    return {
      section,
      present,
      note: present
        ? "Found under a heading a parser recognises."
        : "No recognisable heading for this section.",
    };
  });
}

const ICON_GLYPHS = /[•●▪◦‣⁃·�✓✔▸▶]/g;

/**
 * A plain-text, ATS-safe re-flow of the resume (idea.md §1.6).
 *
 * Deterministic text handling only — bullets normalised to a hyphen, decorative glyphs
 * dropped, tabs and runs of spaces collapsed, blank runs squeezed. It rewrites nothing:
 * the words that come out are the words that went in.
 */
export function toAtsSafeText(resumeText: string): string {
  const lines = (resumeText || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const spaced = line.replace(/[\t   ]/g, " ").trim();
      if (!spaced) return "";
      // Any bullet marker — glyph, hyphen, asterisk — becomes one hyphen. This runs
      // before glyphs are stripped, so a leading bullet still reads as a bullet.
      const bulleted = spaced.replace(
        /^[•●▪◦‣⁃·✓✔▸▶\-–—*+>~»]\s*/,
        "- "
      );
      return bulleted.replace(ICON_GLYPHS, " ").replace(/[ ]{2,}/g, " ").trim();
    });

  const squeezed: string[] = [];
  for (const line of lines) {
    if (!line && squeezed[squeezed.length - 1] === "") continue;
    squeezed.push(line);
  }

  return squeezed.join("\n").trim();
}

/* -------------------------------------------------------------------------- */
/* Validation of model output                                                 */
/* -------------------------------------------------------------------------- */

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function normalizeFindings(raw: unknown): ContentFinding[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const findings: ContentFinding[] = [];

  for (const entry of raw) {
    const checkId = str((entry as { check_id?: unknown })?.check_id);
    // The registry is the source of truth for what this layer checks; a check id it
    // does not carry is a model invention, not a finding.
    if (!LLM_CHECK_IDS.includes(checkId) || seen.has(checkId)) continue;
    seen.add(checkId);

    const item = entry as Record<string, unknown>;
    findings.push({
      check_id: checkId,
      statement: STATEMENT_BY_ID.get(checkId) ?? "",
      passed: item.passed === true,
      section: str(item.section),
      excerpt: str(item.excerpt),
      problem: str(item.problem),
      fix: str(item.fix),
    });
  }

  return findings;
}

function normalizeRewrites(raw: unknown): BulletRewrite[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        original: str(item.original),
        improved: str(item.improved),
        rationale: str(item.rationale),
      };
    })
    .filter((rewrite) => rewrite.original && rewrite.improved)
    .slice(0, MAX_BULLET_REWRITES);
}

function normalizePlacements(raw: unknown, gaps: string[]): KeywordPlacement[] {
  if (!Array.isArray(raw) || gaps.length === 0) return [];

  const allowed = new Set(gaps.map((gap) => gap.toLowerCase()));

  return raw
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        keyword: str(item.keyword),
        section: str(item.section),
        suggestion: str(item.suggestion),
      };
    })
    // A placement for a keyword the resume already has would undo the gap computation.
    .filter((placement) => placement.keyword && allowed.has(placement.keyword.toLowerCase()));
}

/* -------------------------------------------------------------------------- */
/* The call                                                                   */
/* -------------------------------------------------------------------------- */

export interface ReviewResumeContentInput {
  resumeText: string;
  targetJobDescription?: string;
}

/**
 * Runs the content layer over one resume.
 *
 * Model fallback chain and timeout handling follow `parseResume` in src/lib/resume.ts —
 * same house pattern, same reasons.
 */
export async function reviewResumeContent(
  input: ReviewResumeContentInput
): Promise<ResumeContentReview> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please set GOOGLE_GENERATIVE_AI_API_KEY in your environment variables."
    );
  }

  const resumeText = (input.resumeText || "").trim().slice(0, MAX_INPUT_CHARS);
  if (resumeText.length < 50) {
    throw new Error("Resume text is too short to review. Please provide the full resume.");
  }

  const targetJd = (input.targetJobDescription || "").trim().slice(0, MAX_INPUT_CHARS);
  const keywordGaps = targetJd ? computeKeywordGaps(targetJd, resumeText) : [];
  const sectionAnalysis = analyzeSections(resumeText);

  const genAI = new GoogleGenerativeAI(apiKey);
  const candidateModels = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-latest"];

  const gapLine = keywordGaps.length
    ? `\n\nTARGET JOB KEYWORDS MISSING FROM THIS RESUME (computed, not for you to re-check): ${keywordGaps.join(", ")}`
    : "";

  const prompt = `Review the resume below.${gapLine}\n\n--- BEGIN RESUME ---\n${resumeText}\n--- END RESUME ---`;

  let lastError: unknown = null;

  for (const modelName of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ENHANCE_TIMEOUT_MS);

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: ENHANCE_SYSTEM_INSTRUCTION,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: enhanceResponseSchema,
          temperature: 0.2,
        },
      });

      const result = await model.generateContent(
        { contents: [{ role: "user", parts: [{ text: prompt }] }] },
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const responseText = result.response.text();
      if (!responseText) {
        throw new Error("Empty response from the resume content model.");
      }

      const parsed = JSON.parse(responseText);

      return {
        findings: normalizeFindings(parsed.findings),
        bullet_rewrites: normalizeRewrites(parsed.bullet_rewrites),
        summary_present: parsed.summary_present === true,
        summary_strong: parsed.summary_strong === true,
        summary_rewrite: str(parsed.summary_rewrite),
        keyword_gaps: keywordGaps,
        keyword_placements: normalizePlacements(parsed.keyword_placements, keywordGaps),
        section_analysis: sectionAnalysis,
        target_jd_provided: targetJd.length > 0,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      lastError = err;
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (
        errorMessage.includes("404") ||
        errorMessage.includes("not found") ||
        errorMessage.includes("unsupported")
      ) {
        continue;
      }

      console.error(`Error reviewing resume content with model ${modelName}:`, err);
      break;
    }
  }

  throw (
    lastError ||
    new Error("Unable to review the resume content. Please try again.")
  );
}
