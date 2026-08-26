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
