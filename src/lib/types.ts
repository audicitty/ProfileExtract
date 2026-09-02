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
  skills_required: string[];
  experience_level?: string;
  match_score?: number; // 0 to 100
  match_reasons?: string[];
  missing_skills?: string[];
}

export interface JobSearchFilters {
  keywords: string;
  location: string;
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
