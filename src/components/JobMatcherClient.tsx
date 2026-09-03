"use client";

import { useState } from "react";
import {
  ParsedResume,
  JobListing,
  JobSearchFilters,
} from "@/lib/types";
import { downloadJobsCsv } from "@/lib/jobs-csv";
import {
  Briefcase,
  Sparkles,
  MapPin,
  Building2,
  DollarSign,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  Upload,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  TrendingUp,
  Award,
  ChevronDown,
  ChevronUp,
  Check,
  Globe,
  Compass,
} from "lucide-react";

const INDIAN_IT_CITIES = [
  { id: "bangalore", name: "Bangalore", label: "Bangalore (Bengaluru)", hub: "South" },
  { id: "gurgaon", name: "Gurgaon", label: "Gurgaon (Gurugram)", hub: "NCR" },
  { id: "delhi", name: "Delhi / NCR", label: "Delhi / NCR", hub: "NCR" },
  { id: "noida", name: "Noida", label: "Noida", hub: "NCR" },
  { id: "chennai", name: "Chennai", label: "Chennai", hub: "South" },
  { id: "jaipur", name: "Jaipur", label: "Jaipur", hub: "North" },
  { id: "indore", name: "Indore", label: "Indore", hub: "Central" },
  { id: "hyderabad", name: "Hyderabad", label: "Hyderabad", hub: "South" },
  { id: "pune", name: "Pune", label: "Pune", hub: "West" },
  { id: "mumbai", name: "Mumbai", label: "Mumbai", hub: "West" },
  { id: "remote_india", name: "Remote (India)", label: "Remote (India)", hub: "All" },
];

const SAMPLE_RESUME_TEXT = `Divyanshu Bansal
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

export function JobMatcherClient() {
  // Resume Input State
  const [activeTab, setActiveTab] = useState<"paste" | "upload">("paste");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [scanningResume, setScanningResume] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);

  // Multi-Location State: default to user's top IT cities
  const [selectedCities, setSelectedCities] = useState<string[]>([
    "Bangalore",
    "Gurgaon",
    "Noida",
    "Delhi / NCR",
  ]);
  const [customLocationInput, setCustomLocationInput] = useState<string>("");

  // Filters State
  const [filters, setFilters] = useState<JobSearchFilters>({
    keywords: "Full Stack Engineer",
    location: "Bangalore, Gurgaon, Noida",
    locations: ["Bangalore", "Gurgaon", "Noida", "Delhi / NCR"],
    workplace_type: "all",
    date_posted: "past_24h",
    experience_level: "mid",
  });

  // Jobs Search State
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [searchingJobs, setSearchingJobs] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Toggle single city selection
  const toggleCity = (cityName: string) => {
    setSelectedCities((prev) => {
      let updated: string[];
      if (prev.includes(cityName)) {
        updated = prev.filter((c) => c !== cityName);
        if (updated.length === 0) updated = [cityName]; // maintain at least one
      } else {
        updated = [...prev, cityName];
      }
      return updated;
    });
  };

  // Presets
  const handleSelectAllFocusCities = () => {
    setSelectedCities([
      "Bangalore",
      "Gurgaon",
      "Delhi / NCR",
      "Chennai",
      "Jaipur",
      "Indore",
      "Noida",
    ]);
  };

  const handleSelectNcr = () => {
    setSelectedCities(["Gurgaon", "Delhi / NCR", "Noida"]);
  };

  const handleSelectSouth = () => {
    setSelectedCities(["Bangalore", "Chennai", "Hyderabad"]);
  };

  const handleSelectRemote = () => {
    setSelectedCities(["Remote (India)"]);
  };

  // Add custom typed city
  const handleAddCustomCity = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customLocationInput.trim();
    if (trimmed && !selectedCities.includes(trimmed)) {
      setSelectedCities((prev) => [...prev, trimmed]);
      setCustomLocationInput("");
    }
  };

  // Load sample resume for instant 1-click testing
  const handleLoadSample = () => {
    setActiveTab("paste");
    setResumeText(SAMPLE_RESUME_TEXT);
    setResumeError(null);
  };

  const handleClearResume = () => {
    setResumeText("");
    setResumeFile(null);
    setParsedResume(null);
    setResumeError(null);
  };

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

  // Handle Resume Scan
  const handleScanResume = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setResumeError(null);

    let payload: { text?: string; fileBase64?: string; mimeType?: string } = {};

    if (activeTab === "paste") {
      const trimmed = resumeText.trim();
      if (!trimmed || trimmed.length < 50) {
        setResumeError("Please paste at least 50 characters of resume content.");
        return;
      }
      payload = { text: trimmed };
    } else {
      if (!resumeFile) {
        setResumeError("Please select a resume PDF file to upload.");
        return;
      }
      try {
        const base64 = await fileToBase64(resumeFile);
        payload = { fileBase64: base64, mimeType: resumeFile.type || "application/pdf" };
      } catch {
        setResumeError("Failed to read the uploaded file. Please try again.");
        return;
      }
    }

    setScanningResume(true);

    try {
      const res = await fetch("/api/resume/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to scan resume. Please check the document format.");
      }

      const parsed = data.data as ParsedResume;
      setParsedResume(parsed);

      // Auto-update filter keywords and seniority based on resume
      const defaultKeyword =
        parsed.target_roles?.[0] ||
        parsed.suggested_search_keywords?.[0] ||
        filters.keywords;

      const defaultExp =
        parsed.years_of_experience >= 5
          ? "senior"
          : parsed.years_of_experience >= 2
          ? "mid"
          : "entry";

      const updatedFilters: JobSearchFilters = {
        ...filters,
        keywords: defaultKeyword,
        experience_level: defaultExp,
        locations: selectedCities,
        location: selectedCities.join(", "),
      };

      setFilters(updatedFilters);

      // Automatically trigger job search with the parsed resume
      await executeJobSearch(updatedFilters, parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to parse resume.";
      setResumeError(msg);
    } finally {
      setScanningResume(false);
    }
  };

  // Handle Job Search
  const executeJobSearch = async (
    searchFilters: JobSearchFilters,
    resumeProfile: ParsedResume | null = parsedResume
  ) => {
    setSearchingJobs(true);
    setSearchError(null);
    setHasSearched(true);

    const payloadFilters = {
      ...searchFilters,
      locations: selectedCities,
      location: selectedCities.join(", "),
    };

    try {
      const res = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: payloadFilters,
          resumeProfile,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch LinkedIn jobs.");
      }

      setJobs(json.data.jobs || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error searching jobs.";
      setSearchError(msg);
    } finally {
      setSearchingJobs(false);
    }
  };

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeJobSearch(
      {
        ...filters,
        locations: selectedCities,
        location: selectedCities.join(", "),
      },
      parsedResume
    );
  };

  const toggleJobExpand = (id: string) => {
    setExpandedJobId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f4c81] text-white shadow-sm">
              <Briefcase className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              AI Resume Scanner &amp; LinkedIn Job Matcher
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Scan your resume, filter active tech jobs in India (Bangalore, Gurgaon, Delhi, Noida, Chennai, Jaipur, Indore), view AI fit scores, and apply directly.
          </p>
        </div>

        {/* Quick Action Buttons */}
        {jobs.length > 0 && (
          <button
            onClick={() => downloadJobsCsv(jobs, `matched_jobs_${filters.keywords}`)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Export Matched Jobs ({jobs.length})</span>
          </button>
        )}
      </div>

      {/* Step 1: Resume Intake Area */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f4c81] text-xs font-bold text-white">
              1
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Provide Your Resume for AI Fit Analysis
            </h2>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={scanningResume}
              className="font-semibold text-[#0f4c81] hover:underline"
            >
              Load Sample Resume
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={handleClearResume}
              disabled={scanningResume}
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
              disabled={scanningResume}
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
                  setResumeError(null);
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
        {resumeError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <div>
              <strong className="font-semibold">Scan Error: </strong>
              {resumeError}
            </div>
          </div>
        )}

        {/* Scan Trigger Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleScanResume}
            disabled={
              scanningResume ||
              (activeTab === "paste" && !resumeText.trim()) ||
              (activeTab === "upload" && !resumeFile)
            }
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c81] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0a365c] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scanningResume ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Scanning Resume with Gemini AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Scan Resume &amp; Discover Matching Jobs</span>
              </>
            )}
          </button>
        </div>

        {/* Parsed Resume Snapshot Card */}
        {parsedResume && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-bold text-slate-900">
                  {parsedResume.candidate_name || "Candidate Profile"}
                </span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                  {parsedResume.seniority_level} &bull; {parsedResume.years_of_experience} yrs exp
                </span>
              </div>
              {parsedResume.location && (
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  <span>{parsedResume.location}</span>
                </div>
              )}
            </div>

            {parsedResume.summary && (
              <p className="text-xs text-slate-700 leading-relaxed italic">
                &ldquo;{parsedResume.summary}&rdquo;
              </p>
            )}

            {/* Extracted Skills Pills */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Extracted Skills ({parsedResume.extracted_skills.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {parsedResume.extracted_skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 shadow-2xs"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Target Trajectory Roles */}
            {parsedResume.target_roles.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="font-semibold text-slate-600">Target Roles:</span>
                {parsedResume.target_roles.map((role, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const updated = {
                        ...filters,
                        keywords: role,
                        locations: selectedCities,
                        location: selectedCities.join(", "),
                      };
                      setFilters(updated);
                      executeJobSearch(updated, parsedResume);
                    }}
                    className="rounded bg-white px-2 py-0.5 font-medium text-[#0f4c81] border border-blue-200 hover:bg-blue-100 transition"
                  >
                    + Search &ldquo;{role}&rdquo;
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Advanced Search Filters Toolbar */}
      <form
        onSubmit={handleFilterSubmit}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f4c81] text-xs font-bold text-white">
            2
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
            Refine Job Search &amp; Location Filters
          </h2>
        </div>

        {/* LOCATION MULTI-SELECT CARD */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#0f4c81]" />
              <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Target IT Cities in India (Select Multiple)
              </label>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-[#0f4c81]">
                {selectedCities.length} Selected
              </span>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400">Presets:</span>
              <button
                type="button"
                onClick={handleSelectAllFocusCities}
                className="rounded bg-white px-2 py-1 font-medium text-slate-700 border border-slate-200 hover:border-slate-300 transition"
              >
                All 7 Core Cities
              </button>
              <button
                type="button"
                onClick={handleSelectNcr}
                className="rounded bg-white px-2 py-1 font-medium text-slate-700 border border-slate-200 hover:border-slate-300 transition"
              >
                NCR
              </button>
              <button
                type="button"
                onClick={handleSelectSouth}
                className="rounded bg-white px-2 py-1 font-medium text-slate-700 border border-slate-200 hover:border-slate-300 transition"
              >
                South Hubs
              </button>
              <button
                type="button"
                onClick={handleSelectRemote}
                className="rounded bg-white px-2 py-1 font-medium text-slate-700 border border-slate-200 hover:border-slate-300 transition"
              >
                Remote Only
              </button>
            </div>
          </div>

          {/* Interactive Multi-Select City Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-1">
            {INDIAN_IT_CITIES.map((city) => {
              const isSelected = selectedCities.includes(city.name);
              return (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => toggleCity(city.name)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition cursor-pointer text-left ${
                    isSelected
                      ? "border-[#0f4c81] bg-[#0f4c81] text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate">{city.label}</span>
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 text-white shrink-0 ml-1" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded border border-slate-300 shrink-0 ml-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom City Addition */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs">
            <div className="text-slate-500 font-medium whitespace-nowrap">
              Add custom location:
            </div>
            <div className="flex items-center gap-1.5 flex-1 max-w-sm">
              <input
                type="text"
                value={customLocationInput}
                onChange={(e) => setCustomLocationInput(e.target.value)}
                placeholder="e.g. Ahmedabad, Kolkata, Chandigarh"
                className="w-full rounded border border-slate-300 py-1.5 px-2.5 text-xs text-slate-900 bg-white focus:border-[#0f4c81] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustomCity}
                disabled={!customLocationInput.trim()}
                className="rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50 transition"
              >
                Add
              </button>
            </div>
            <div className="text-[11px] text-slate-500 italic">
              Active: {selectedCities.join(", ")}
            </div>
          </div>
        </div>

        {/* ROLE, WORKPLACE, DATE, LEVEL FILTERS */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Target Role / Keywords */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Job Title or Keywords
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Briefcase className="h-3.5 w-3.5" />
              </div>
              <input
                type="text"
                value={filters.keywords}
                onChange={(e) => setFilters({ ...filters, keywords: e.target.value })}
                placeholder="e.g. Full Stack Developer"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-[#0f4c81] focus:outline-none focus:ring-1 focus:ring-[#0f4c81]"
              />
            </div>
          </div>

          {/* Workplace Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Workplace Mode
            </label>
            <select
              value={filters.workplace_type}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  workplace_type: e.target.value as JobSearchFilters["workplace_type"],
                })
              }
              className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs text-slate-900 focus:border-[#0f4c81] focus:outline-none focus:ring-1 focus:ring-[#0f4c81]"
            >
              <option value="all">All Modes (Remote + Hybrid + On-site)</option>
              <option value="remote">Remote Only</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </div>

          {/* Date Posted */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Date Posted
            </label>
            <select
              value={filters.date_posted}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  date_posted: e.target.value as JobSearchFilters["date_posted"],
                })
              }
              className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs text-slate-900 focus:border-[#0f4c81] focus:outline-none focus:ring-1 focus:ring-[#0f4c81]"
            >
              <option value="past_24h">Latest (Past 24 Hours)</option>
              <option value="past_week">Past Week (7 Days)</option>
              <option value="past_month">Past Month</option>
              <option value="all">Anytime</option>
            </select>
          </div>
        </div>

        {/* Filter Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Clock className="h-3.5 w-3.5 text-blue-600" />
            <span>
              Searching verified openings across: <strong>{selectedCities.join(", ")}</strong>
            </span>
          </div>

          <button
            type="submit"
            disabled={searchingJobs}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f4c81] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0a365c] disabled:opacity-50"
          >
            {searchingJobs ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Finding Openings...</span>
              </>
            ) : (
              <>
                <Filter className="h-3.5 w-3.5" />
                <span>Search &amp; Match Jobs ({selectedCities.length} Cities)</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Search Error Alert */}
      {searchError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div>
            <strong className="font-semibold">Search Error: </strong>
            {searchError}
          </div>
        </div>
      )}

      {/* Step 3: Jobs Grid / Results */}
      {searchingJobs && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#0f4c81] border-t-transparent" />
          <h3 className="text-base font-bold text-slate-800">
            Scanning Openings in {selectedCities.slice(0, 3).join(", ")}...
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Pulling active listings for &ldquo;{filters.keywords}&rdquo; and matching against your background.
          </p>
        </div>
      )}

      {!searchingJobs && hasSearched && jobs.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-2">
          <Briefcase className="h-8 w-8 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Jobs Found</h3>
          <p className="text-xs text-slate-500">
            Try broadening your keywords or selecting additional IT cities above.
          </p>
        </div>
      )}

      {!searchingJobs && jobs.length > 0 && (
        <div className="space-y-4">
          {/* Results Summary Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 rounded-lg p-3.5 border border-slate-200">
            <div className="flex items-center gap-2 text-xs">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span className="font-bold text-slate-900">
                Found {jobs.length} Verified Job Openings
              </span>
              {parsedResume && (
                <span className="text-slate-500">
                  &bull; Ranked by match fit for <strong>{parsedResume.candidate_name || "you"}</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadJobsCsv(jobs, `jobs_${filters.keywords}`)}
                className="inline-flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 shadow-2xs hover:bg-slate-50 transition"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                <span>Export CSV ({jobs.length})</span>
              </button>
            </div>
          </div>

          {/* Jobs Listing Cards */}
          <div className="grid grid-cols-1 gap-4">
            {jobs.map((job) => {
              const isExpanded = expandedJobId === job.id;
              const matchScore = job.match_score || 70;

              return (
                <div
                  key={job.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md space-y-4"
                >
                  {/* Card Top: Title, Company, Match Score Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900 hover:text-[#0f4c81] transition">
                          {job.title}
                        </h3>
                        {/* Workplace Type Badge */}
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            job.workplace_type === "Remote"
                              ? "bg-blue-100 text-blue-800"
                              : job.workplace_type === "Hybrid"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {job.workplace_type}
                        </span>

                        {/* Date Posted Badge */}
                        <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          <span>{job.posted_date}</span>
                        </span>
                      </div>

                      {/* Company & Location & Salary */}
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-600">
                        <div className="flex items-center gap-1 font-semibold text-slate-800">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          <span>{job.company}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-medium text-slate-700">{job.location}</span>
                        </div>
                        {job.salary && (
                          <div className="flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                            <DollarSign className="h-3 w-3" />
                            <span>{job.salary}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Match Score Badge */}
                    {job.match_score && (
                      <div className="flex items-center gap-2 self-start rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-emerald-800">
                        <Award className="h-4 w-4 text-emerald-600" />
                        <div>
                          <div className="text-xs font-bold leading-none">
                            {matchScore}% Match
                          </div>
                          <div className="text-[10px] text-emerald-600 leading-tight mt-0.5">
                            AI Fit Score
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Skills Required Pills */}
                  {job.skills_required && job.skills_required.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {job.skills_required.map((skill, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Match Strengths & Gap Insights */}
                  {job.match_reasons && job.match_reasons.length > 0 && (
                    <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1.5 border border-slate-100">
                      <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-[#0f4c81]" />
                        <span>Why You Fit This Role:</span>
                      </div>
                      <ul className="list-disc list-inside text-slate-600 space-y-0.5 text-[11px]">
                        {job.match_reasons.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                      {job.missing_skills && job.missing_skills.length > 0 && (
                        <div className="text-[11px] text-amber-700 pt-1">
                          <strong>Skills to highlight / brush up:</strong> {job.missing_skills.slice(0, 4).join(", ")}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Job Description (Expandable) */}
                  {job.description && (
                    <div className="text-xs text-slate-600">
                      <p className={isExpanded ? "" : "line-clamp-2"}>
                        {job.description}
                      </p>
                      {job.description.length > 150 && (
                        <button
                          type="button"
                          onClick={() => toggleJobExpand(job.id)}
                          className="mt-1 text-[11px] font-semibold text-[#0f4c81] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{isExpanded ? "Show Less" : "Read Full Description"}</span>
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Card Bottom: Direct Action Links */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="text-[11px] text-slate-500">
                      Verified Opportunity &bull; Direct links to active hiring post
                    </div>

                    <div className="flex items-center gap-2">
                      {job.company_apply_url && (
                        <a
                          href={job.company_apply_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900"
                        >
                          <Building2 className="h-3.5 w-3.5 text-slate-500" />
                          <span>Company Profile</span>
                        </a>
                      )}

                      <a
                        href={job.apply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f4c81] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0a365c] hover:shadow"
                      >
                        <span>Apply on LinkedIn</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
