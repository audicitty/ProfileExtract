import { JobListing } from "./types";
import { escapeCsvCell } from "./csv";

/**
 * Generates an RFC 4180-compliant CSV string representing a list of matched jobs.
 */
export function generateJobsCsv(jobs: JobListing[]): string {
  const headers = [
    "Job Title",
    "Company",
    "Match Score",
    "Workplace Type",
    "Location",
    "Salary",
    "Posted Date",
    "Direct Apply Link",
    "Required Skills",
    "Match Strengths",
    "Missing Skills",
    "Description",
  ];

  const rows = jobs.map((job) => {
    return [
      job.title || "",
      job.company || "",
      job.match_score ? `${job.match_score}%` : "N/A",
      job.workplace_type || "",
      job.location || "",
      job.salary || "",
      job.posted_date || "",
      job.apply_url || "",
      Array.isArray(job.skills_required) ? job.skills_required.join("; ") : "",
      Array.isArray(job.match_reasons) ? job.match_reasons.join("; ") : "",
      Array.isArray(job.missing_skills) ? job.missing_skills.join("; ") : "",
      (job.description || "").replace(/[\r\n]+/g, " "),
    ];
  });

  const headerLine = headers.map(escapeCsvCell).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(","));

  return [headerLine, ...dataLines].join("\r\n");
}

/**
 * Triggers a client-side download of the jobs CSV.
 */
export function downloadJobsCsv(jobs: JobListing[], filenamePrefix: string = "linkedin_jobs"): void {
  const csvContent = generateJobsCsv(jobs);

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const safePrefix = filenamePrefix.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const filename = `${safePrefix}_${Date.now()}.csv`;

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
