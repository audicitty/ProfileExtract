import { ProfileData } from "./types";

/**
 * Escapes a cell value according to RFC 4180 CSV standard.
 * Double quotes are doubled, and the value is enclosed in quotes.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '""';
  }
  const str = String(val).trim();
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Formats a clean, serialized string of work experience entries.
 */
export function formatExperienceText(experience: ProfileData["experience"]): string {
  if (!experience || experience.length === 0) return "";
  return experience
    .map((exp, idx) => {
      const header = `${idx + 1}. ${exp.title || "Role"} at ${exp.company || "Company"}${
        exp.duration ? ` (${exp.duration})` : ""
      }`;
      return exp.description ? `${header}:\n   ${exp.description}` : header;
    })
    .join("\n\n");
}

/**
 * Formats a clean, serialized string of education entries.
 */
export function formatEducationText(education: ProfileData["education"]): string {
  if (!education || education.length === 0) return "";
  return education
    .map((edu, idx) => {
      const deg = edu.degree ? ` - ${edu.degree}` : "";
      const yrs = edu.years ? ` (${edu.years})` : "";
      return `${idx + 1}. ${edu.school || "Institution"}${deg}${yrs}`;
    })
    .join("\n");
}

/**
 * Formats a clean, serialized string of projects.
 */
export function formatProjectsText(projects: ProfileData["projects"]): string {
  if (!projects || projects.length === 0) return "";
  return projects
    .map((p, idx) => {
      return p.description ? `${idx + 1}. ${p.name}:\n   ${p.description}` : `${idx + 1}. ${p.name}`;
    })
    .join("\n\n");
}

/**
 * Formats a clean, serialized string of certifications.
 */
export function formatCertificationsText(certifications: ProfileData["certifications"]): string {
  if (!certifications || certifications.length === 0) return "";
  return certifications
    .map((c, idx) => {
      const issuer = c.issuer ? ` by ${c.issuer}` : "";
      const date = c.date ? ` (${c.date})` : "";
      return `${idx + 1}. ${c.name}${issuer}${date}`;
    })
    .join("\n");
}

/**
 * Converts ProfileData into a single-header, standard tabular Flat CSV (1 candidate = 1 clean row).
 * Optimal for Excel, Google Sheets, Airtable, Notion, and CRM database imports.
 */
export function generateProfileCsv(profile: ProfileData): string {
  const headers = [
    "First Name",
    "Last Name",
    "Full Name",
    "Headline",
    "Current Title",
    "Current Company",
    "Location",
    "About",
    "Skills",
    "Work Experience",
    "Education",
    "Projects",
    "Certifications",
  ];

  const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  const skillsText = Array.isArray(profile.skills) ? profile.skills.join("; ") : "";

  const row = [
    profile.first_name || "",
    profile.last_name || "",
    fullName,
    profile.headline || "",
    profile.current_title || "",
    profile.current_company || "",
    profile.location || "",
    profile.about || "",
    skillsText,
    formatExperienceText(profile.experience),
    formatEducationText(profile.education),
    formatProjectsText(profile.projects),
    formatCertificationsText(profile.certifications),
  ];

  return [
    headers.map(escapeCsvCell).join(","),
    row.map(escapeCsvCell).join(","),
  ].join("\r\n");
}

/**
 * Triggers a browser download of the standard flat profile CSV.
 */
export function downloadProfileCsv(profile: ProfileData): void {
  const csvContent = generateProfileCsv(profile);

  // Add UTF-8 Byte Order Mark (BOM) so Excel and spreadsheet tools open international characters correctly
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const safeFirstName = (profile.first_name || "profile")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  const safeLastName = (profile.last_name || "extract")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  const filename = `${safeFirstName}_${safeLastName}_structured.csv`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

