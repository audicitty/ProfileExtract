export interface EducationItem {
  school: string;
  degree: string;
  years: string;
}

export interface ExperienceItem {
  company: string;
  title: string;
  duration: string;
  description: string;
}

export interface ProjectItem {
  name: string;
  description: string;
}

export interface CertificationItem {
  name: string;
  issuer: string;
  date: string;
}

export interface ProfileData {
  first_name: string;
  last_name: string;
  headline: string;
  current_company: string;
  current_title: string;
  location: string;
  about: string;
  education: EducationItem[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  skills: string[];
}

export interface ExtractResponse {
  success: boolean;
  data?: ProfileData;
  error?: string;
}

export interface ParsedResume {
  candidate_name: string;
  email?: string;
  phone?: string;
  location?: string;
  target_roles: string[];
  extracted_skills: string[];
  years_of_experience: number;
  seniority_level: "Entry-level" | "Mid-level" | "Senior" | "Lead / Manager" | "Executive";
  summary: string;
  suggested_search_keywords: string[];
}

export interface JobListing {
  id: string;
  title: string;
  company: string;
  company_logo?: string;
  location: string;
  workplace_type: "Remote" | "Hybrid" | "On-site";
  salary?: string;
  posted_date: string;
  description: string;
  apply_url: string;
  company_apply_url?: string;
  skills_required: string[];
  /**
   * Where `skills_required` came from.
   * "posting"  — parsed from the real job description body.
   * "inferred" — guessed from the job title because the fetch failed or was skipped.
   */
  skills_source: "posting" | "inferred";
  experience_level?: string;
  match_score?: number; // 0 to 100
  match_reasons?: string[];
  missing_skills?: string[];
  /**
   * How much the score can be trusted.
   * "high"   — scored against requirements parsed from the posting.
   * "medium" — scored against skills inferred from the title.
   * "low"    — no usable skills data; the score reflects title alignment only.
   */
  match_confidence?: "high" | "medium" | "low";
}

export interface JobSearchFilters {
  keywords: string;
  location: string;
  locations?: string[];
  workplace_type: "all" | "remote" | "hybrid" | "onsite";
  date_posted: "all" | "past_24h" | "past_week" | "past_month";
  experience_level: "all" | "entry" | "mid" | "senior";
}

export interface JobSearchResponse {
  success: boolean;
  data?: {
    jobs: JobListing[];
    total: number;
    filters_applied: JobSearchFilters;
    resume_matched: boolean;
  };
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Resume ATS audit — structural layer (checks/registry.yaml, idea.md §1.1)   */
/* -------------------------------------------------------------------------- */

/** One positioned text item as PDF.js reports it, in PDF space (origin bottom-left). */
export interface PdfTextItem {
  page: number;
  /** Position in the page's content stream. Reading order as the file declares it. */
  flow_index: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
  font_name: string;
}

export interface PdfPage {
  number: number;
  width: number;
  height: number;
  /** Lower-left corner of the page box; y coordinates are measured from here. */
  x_origin: number;
  y_origin: number;
  items: PdfTextItem[];
}

/**
 * A resume PDF reduced to positioned text. This is the only input the structural
 * checks take, which is what keeps them pure — see `src/lib/resume-ats.ts`.
 */
export interface ResumeDocument {
  page_count: number;
  pages: PdfPage[];
  /** Every item across every page, in flow order. */
  items: PdfTextItem[];
  /** Plain text, lines separated by newlines, blocks on a line by two spaces. */
  text: string;
}

/** Registry category, taken from the part of a check id before the first dot. */
export type AtsCategory = "parseability" | "structure" | "layout" | "contact" | "dates";

export type AtsCheckStatus = "pass" | "fail" | "not_applicable";

export type AtsSeverity = "critical" | "warning" | "minor";

/** What one registry check found. Never a bare boolean — the UI has to explain it. */
export interface AtsFinding {
  check_id: string;
  category: AtsCategory;
  /** Registry statement, verbatim. */
  statement: string;
  status: AtsCheckStatus;
  /** The bench-measured weight from the registry. 0 means measured, no drop. */
  severity_points: number;
  /** severity_points when the check failed, otherwise 0. */
  points_deducted: number;
  /** Registry confidence. "single-parser" means low confidence (CLAUDE.md §8.3). */
  confidence: string;
  /** Registry caveat, when the bench did not settle the check (CLAUDE.md §8.4). */
  caveat?: string;
  /** Why this status, in one sentence. */
  detail: string;
  /** Lines or values the finding is based on, so a user can go look. */
  evidence: string[];
  /** Numbers the check measured, for debugging and for the UI to show. */
  measurements: Record<string, number | string | boolean>;
}

/**
 * A failed check, shaped for display. idea.md §1.4 sketched `before`/`after` for
 * rewritten text; a structural check has no rewrite, so those stay optional and are
 * filled by the Phase 4 content layer.
 */
export interface ResumeIssue {
  check_id: string;
  severity: AtsSeverity;
  severity_points: number;
  confidence: string;
  category: AtsCategory;
  /** Resume section the issue was found in, when the check can name one. */
  section: string | null;
  problem: string;
  fix: string;
  evidence: string[];
  caveat?: string;
  before?: string;
  after?: string;
}

/**
 * The structural half of the audit. `ats_score` and `sub_scores` are computed in
 * TypeScript from registry weights — no model is involved (idea.md §1.1 "Scoring").
 */
export interface ResumeAudit {
  /** 0-100, or null when the PDF carries no text to analyse. */
  ats_score: number | null;
  status: "scored" | "no_text_layer";
  /** Per registry category. null when no check in that category was applicable. */
  sub_scores: Partial<Record<AtsCategory, number | null>>;
  issues: ResumeIssue[];
  /** Every deterministic check that ran, including the ones that passed. */
  findings: AtsFinding[];
  registry: {
    bench_run_at: string;
    flag_threshold_points: number;
    checks_run: number;
  };
  /* Populated by the Phase 4 LLM content layer, not by resume-ats.ts. */
  bullet_rewrites?: { original: string; improved: string; rationale: string }[];
  keyword_gaps?: string[];
  section_analysis?: { section: string; present: boolean; note: string }[];
}

/* -------------------------------------------------------------------------- */
/* Resume content review — LLM layer (idea.md §1.1 division of labour)        */
/* -------------------------------------------------------------------------- */

export interface BulletRewrite {
  original: string;
  improved: string;
  rationale: string;
}

/**
 * One judgement call from the content layer. `check_id` is always a registry check
 * with `layer: "llm"`; anything else the model returns is dropped.
 *
 * These carry no `severity_points`. The registry records every content check as
 * `not-bench-measurable` (CLAUDE.md §8.2), so they are reported, never scored.
 */
export interface ContentFinding {
  check_id: string;
  statement: string;
  /** The model's verdict for this check across the resume. */
  passed: boolean;
  section: string;
  /** The resume's own words the verdict is about. */
  excerpt: string;
  problem: string;
  fix: string;
}

/** Where one missing target-JD keyword could be added. Gaps themselves are TS-computed. */
export interface KeywordPlacement {
  keyword: string;
  section: string;
  suggestion: string;
}

/** Everything the content model returns, after validation. It never returns a score. */
export interface ResumeContentReview {
  findings: ContentFinding[];
  bullet_rewrites: BulletRewrite[];
  summary_present: boolean;
  summary_strong: boolean;
  summary_rewrite: string;
  /** Deterministic: token-boundary match of JD skills against the resume text. */
  keyword_gaps: string[];
  /** Model-proposed placements for those gaps. Empty without a target JD. */
  keyword_placements: KeywordPlacement[];
  section_analysis: { section: string; present: boolean; note: string }[];
  /** True when a target job description was supplied. */
  target_jd_provided: boolean;
}

/** What POST /api/resume/enhance returns on success. */
export interface ResumeEnhanceResult {
  /** The structural audit, or null when the input was pasted text (no PDF to measure). */
  audit: ResumeAudit | null;
  /** Why `audit` is null, when it is. */
  audit_skipped_reason?: "text_input" | "pdf_unreadable";
  content: ResumeContentReview;
  /** Deterministic plain-text re-flow of the resume (idea.md §1.6). */
  ats_safe_text: string;
}
