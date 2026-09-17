export interface ResumeProfile {
  name: string;
  email: string;
  phone: string;
  url: string;
  summary: string;
  location: string;
}

export interface ResumeWorkExperience {
  company: string;
  jobTitle: string;
  date: string;
  descriptions: string[];
}

export interface ResumeEducation {
  school: string;
  degree: string;
  date: string;
  gpa: string;
  descriptions: string[];
}

export interface ResumeProject {
  project: string;
  date: string;
  descriptions: string[];
}

export interface FeaturedSkill {
  skill: string;
  rating: number;
}

export interface ResumeSkills {
  featuredSkills: FeaturedSkill[];
  descriptions: string[];
}

export interface ResumeCustom {
  descriptions: string[];
}

export interface Resume {
  profile: ResumeProfile;
  workExperiences: ResumeWorkExperience[];
  educations: ResumeEducation[];
  projects: ResumeProject[];
  skills: ResumeSkills;
  custom: ResumeCustom;
}

export type ResumeKey = keyof Resume;

// --- profex bench addition ---
// Upstream imports `initialFeaturedSkills` from lib/redux/resumeSlice.ts, which pulls in
// the whole Redux store. Only this constant is needed by extract-skills.ts, so it is
// reproduced here (same shape and length as upstream) to keep the vendored subtree
// free of Redux. See NOTICE.md.
export const initialFeaturedSkills: FeaturedSkill[] = Array(6)
  .fill(null)
  .map(() => ({ skill: "", rating: 4 }));
