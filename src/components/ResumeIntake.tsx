"use client";

import { useState, type ReactNode } from "react";
import { AlertCircle, FileText, Upload } from "lucide-react";

/** What the intake hands back — the body both /api/resume/* routes accept. */
export interface ResumeIntakePayload {
  text?: string;
  fileBase64?: string;
  mimeType?: string;
}

interface ResumeIntakeProps {
  /** Called with a validated payload. Caller-side failures come back in via `error`. */
  onSubmit: (payload: ResumeIntakePayload) => void | Promise<void>;
  /** Disables the whole panel while the caller works. */
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  submitIcon: ReactNode;
  heading: string;
  stepLabel?: string;
  /** Owned by the caller so its own request errors render in the same alert. */
  error?: string | null;
  onError: (message: string | null) => void;
  errorTitle?: string;
  /** Offers "Load Sample Resume" when provided. */
  sampleText?: string;
  /** Caller-side reset — the intake clears its own text/file either way. */
  onClear?: () => void;
  /** Rendered inside the panel, under the button (e.g. the parsed resume card). */
  children?: ReactNode;
}

/**
 * The paste / PDF-upload intake, shared by the Job Matcher and the Resume Enhancer
 * (idea.md §1.5). It owns the tab, the textarea, the file and the base64 conversion;
 * what happens to the resume afterwards belongs entirely to the caller.
 */
export function ResumeIntake({
  onSubmit,
  busy,
  submitLabel,
  busyLabel,
  submitIcon,
  heading,
  stepLabel = "1",
  error,
  onError,
  errorTitle = "Scan Error",
  sampleText,
  onClear,
  children,
}: ResumeIntakeProps) {
  const [activeTab, setActiveTab] = useState<"paste" | "upload">("paste");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  // Convert uploaded PDF to base64
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        const base64 = res.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleLoadSample = () => {
    if (!sampleText) return;
    setActiveTab("paste");
    setResumeText(sampleText);
    onError(null);
  };

  const handleClear = () => {
    setResumeText("");
    setResumeFile(null);
    onError(null);
    onClear?.();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onError(null);

    let payload: ResumeIntakePayload = {};

    if (activeTab === "paste") {
      const trimmed = resumeText.trim();
      if (!trimmed || trimmed.length < 50) {
        onError("Please paste at least 50 characters of resume content.");
        return;
      }
      payload = { text: trimmed };
    } else {
      if (!resumeFile) {
        onError("Please select a resume PDF file to upload.");
        return;
      }
      try {
        const base64 = await fileToBase64(resumeFile);
        payload = { fileBase64: base64, mimeType: resumeFile.type || "application/pdf" };
      } catch {
        onError("Failed to read the uploaded file. Please try again.");
        return;
      }
    }

    await onSubmit(payload);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f4c81] text-xs font-bold text-white">
            {stepLabel}
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            {heading}
          </h2>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {sampleText && (
            <>
              <button
                type="button"
                onClick={handleLoadSample}
                disabled={busy}
                className="font-semibold text-[#0f4c81] hover:underline"
              >
                Load Sample Resume
              </button>
              <span className="text-slate-300">|</span>
            </>
          )}
          <button
            type="button"
            onClick={handleClear}
            disabled={busy}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Tabs: Paste Text vs Upload File */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("paste")}
          className={`rounded-md px-3 py-1.5 transition ${
            activeTab === "paste"
              ? "bg-[#0f4c81] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Paste Resume Text
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("upload")}
          className={`rounded-md px-3 py-1.5 transition ${
            activeTab === "upload"
              ? "bg-[#0f4c81] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Upload Resume (PDF)
        </button>
      </div>

      {/* Active Tab Body */}
      {activeTab === "paste" ? (
        <div>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your full resume text or paste key work experience, skills, and summary here..."
            rows={5}
            disabled={busy}
            className="w-full rounded-lg border border-slate-300 p-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0f4c81] focus:outline-none focus:ring-1 focus:ring-[#0f4c81] disabled:bg-slate-50 font-mono"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-8 text-center hover:bg-slate-50 transition">
          <Upload className="h-8 w-8 text-slate-400 mb-2" />
          <label
            htmlFor="resume-upload"
            className="cursor-pointer text-sm font-semibold text-[#0f4c81] hover:underline"
          >
            Select a PDF resume file
          </label>
          <p className="text-xs text-slate-500 mt-1">
            Supports standard .pdf resumes (up to 10MB)
          </p>
          <input
            id="resume-upload"
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                setResumeFile(e.target.files[0]);
                onError(null);
              }
            }}
            className="hidden"
          />
          {resumeFile && (
            <div className="mt-3 flex items-center gap-2 rounded bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800">
              <FileText className="h-4 w-4 text-[#0f4c81]" />
              <span>Selected: {resumeFile.name} ({(resumeFile.size / 1024).toFixed(0)} KB)</span>
            </div>
          )}
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div>
            <strong className="font-semibold">{errorTitle}: </strong>
            {error}
          </div>
        </div>
      )}

      {/* Submit Trigger Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            busy ||
            (activeTab === "paste" && !resumeText.trim()) ||
            (activeTab === "upload" && !resumeFile)
          }
          className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c81] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0a365c] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>{busyLabel}</span>
            </>
          ) : (
            <>
              {submitIcon}
              <span>{submitLabel}</span>
            </>
          )}
        </button>
      </div>

      {children}
    </div>
  );
}

/** Shared sample, so both workspaces demo on the same resume. */
export const SAMPLE_RESUME_TEXT = `Divyanshu Bansal
Full Stack Engineer | Bangalore, India | divyanshu.bansal@example.com | +91 98765 43210

Summary:
Energetic and results-driven Full Stack Engineer with 3+ years of experience building responsive web applications, scalable backend microservices, and high-performance databases. Proficient in TypeScript, React, Next.js, Node.js, Express, PostgreSQL, and AWS. Passionate about shipping robust features, clean code, and intuitive user experiences.

Core Technical Skills:
- Languages & Frontend: TypeScript, JavaScript, React.js, Next.js, Redux, Tailwind CSS, HTML5/CSS3
- Backend & Frameworks: Node.js, Express.js, RESTful APIs, GraphQL, Python
- Databases: PostgreSQL, MongoDB, Redis, Drizzle ORM, Prisma
- Cloud & Tools: AWS (EC2, S3), Docker, Git, GitHub Actions, CI/CD, Postman

Professional Experience:
Full Stack Software Developer | TechInnovate Solutions | Jan 2023 - Present
- Engineered high-traffic customer-facing web modules using Next.js and TypeScript, improving page load speed by 35%.
- Designed and maintained REST APIs in Node.js and PostgreSQL handling 50,000+ daily requests.
- Integrated automated CI/CD deployment pipelines using GitHub Actions and Docker.

Software Engineer Intern | CloudMatrix Labs | Jun 2022 - Dec 2022
- Developed interactive UI dashboards using React, Tailwind CSS, and Chart.js.
- Implemented JWT authentication and role-based access control.

Education:
B.Tech in Computer Science and Engineering | 2019 - 2023`;
