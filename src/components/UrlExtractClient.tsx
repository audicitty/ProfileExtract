"use client";

import { useState } from "react";
import Link from "next/link";
import { ProfileData } from "@/lib/types";
import { ProfileResults } from "./ProfileResults";
import {
  Globe,
  Sparkles,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Zap,
  FileSpreadsheet,
} from "lucide-react";

const SAMPLE_URL = "https://www.linkedin.com/in/satyanadella";

export function UrlExtractClient() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [progressStep, setProgressStep] = useState<number>(0);

  const handleLoadSample = () => {
    setUrl(SAMPLE_URL);
    setError(null);
  };

  const handleClear = () => {
    setUrl("");
    setError(null);
    setProfile(null);
    setProgressStep(0);
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProfile(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a profile URL.");
      return;
    }

    setLoading(true);
    setProgressStep(1);

    // Simulate progress milestones for enhanced feedback
    const timer1 = setTimeout(() => setProgressStep(2), 2000);
    const timer2 = setTimeout(() => setProgressStep(3), 8000);

    try {
      const res = await fetch("/api/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      clearTimeout(timer1);
      clearTimeout(timer2);

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(
          json.error || "Failed to extract profile data. Please verify the URL and try again."
        );
      }

      setProgressStep(4);
      setProfile(json.data);
    } catch (err: unknown) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while fetching the profile.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner & Title */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f4c81] text-white shadow-sm">
              <Globe className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              URL Profile Extractor
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Paste any LinkedIn or public profile URL to automatically scrape and structure profile data into interactive tables &amp; CSV.
          </p>
        </div>

        {/* Switch to Job Matcher */}
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
        >
          <span>Job Matcher AI</span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
        </Link>
      </div>

      {/* URL Input Workspace Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Help Banner */}
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-900">
          <Zap className="h-4 w-4 shrink-0 text-[#0f4c81] mt-0.5" />
          <div className="leading-relaxed">
            <strong>Powered by Bright Data Web Scraper API:</strong> Provide any public LinkedIn profile URL (e.g.{" "}
            <code className="rounded bg-blue-100/70 px-1 py-0.5 font-mono text-[11px]">
              https://www.linkedin.com/in/username
            </code>
            ). The scraper will retrieve live profile attributes, normalize them into structured tables, and make them ready for CSV export.
          </div>
        </div>

        <form onSubmit={handleExtract} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="profile-url"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                LinkedIn Profile URL
              </label>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={handleLoadSample}
                  disabled={loading}
                  className="font-medium text-[#0f4c81] hover:underline"
                >
                  Load Sample URL
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={loading}
                  className="text-slate-400 hover:text-slate-600 transition"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Globe className="h-4 w-4" />
              </div>
              <input
                id="profile-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/satyanadella"
                disabled={loading}
                className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0f4c81] focus:outline-none focus:ring-1 focus:ring-[#0f4c81] disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="font-semibold">Extraction Failed: </strong>
                {error}
              </div>
            </div>
          )}

          {/* Live Progress Milestones during extraction */}
          {loading && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                <span className="flex items-center gap-2">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0f4c81] border-t-transparent" />
                  Bright Data Scraper In Progress...
                </span>
                <span className="text-slate-500 font-mono text-[11px]">
                  {progressStep === 1 && "Connecting (25%)"}
                  {progressStep === 2 && "Scraping Profile (60%)"}
                  {progressStep === 3 && "Structuring Tables (85%)"}
                  {progressStep === 4 && "Finalizing (100%)"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600">
                <div
                  className={`flex items-center gap-1.5 rounded p-2 ${
                    progressStep >= 1 ? "bg-white text-slate-900 font-medium shadow-xs" : "opacity-50"
                  }`}
                >
                  <CheckCircle2
                    className={`h-3.5 w-3.5 ${
                      progressStep >= 1 ? "text-emerald-600" : "text-slate-300"
                    }`}
                  />
                  <span>1. Trigger Bright Data API</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded p-2 ${
                    progressStep >= 2 ? "bg-white text-slate-900 font-medium shadow-xs" : "opacity-50"
                  }`}
                >
                  <CheckCircle2
                    className={`h-3.5 w-3.5 ${
                      progressStep >= 2 ? "text-emerald-600" : "text-slate-300"
                    }`}
                  />
                  <span>2. Scrape Live Profile</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded p-2 ${
                    progressStep >= 3 ? "bg-white text-slate-900 font-medium shadow-xs" : "opacity-50"
                  }`}
                >
                  <CheckCircle2
                    className={`h-3.5 w-3.5 ${
                      progressStep >= 3 ? "text-emerald-600" : "text-slate-300"
                    }`}
                  />
                  <span>3. Format Tables &amp; CSV</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Direct Web Scraper &bull; Zero storage of raw scraped data</span>
            </div>

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f4c81] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a365c] focus:outline-none focus:ring-2 focus:ring-[#0f4c81] focus:ring-offset-2 ${
                loading || !url.trim() ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Fetching Data...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Fetch &amp; Structure Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Profile Results Rendering */}
      {profile && (
        <div className="pt-4 border-t border-slate-200">
          <ProfileResults profile={profile} onReset={handleClear} />
        </div>
      )}
    </div>
  );
}
