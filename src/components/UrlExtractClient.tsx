"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ProfileData } from "@/lib/types";
import { ProfileResults } from "./ProfileResults";
import {
  Globe,
  Sparkles,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Zap,
} from "lucide-react";

const SAMPLE_URL = "https://www.linkedin.com/in/satyanadella";

const PROGRESS_STEPS = [
  { threshold: 1, label: "Trigger Bright Data API" },
  { threshold: 2, label: "Scrape Live Profile" },
  { threshold: 3, label: "Format Tables & CSV" },
] as const;

export function UrlExtractClient() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [progressStep, setProgressStep] = useState<number>(0);
  const reduceMotion = useReducedMotion();

  const clampedStep = Math.min(progressStep, PROGRESS_STEPS.length);
  const railFillPercent =
    clampedStep <= 1 ? 0 : ((clampedStep - 1) / (PROGRESS_STEPS.length - 1)) * 100;

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

  const handleExtract = async (e: FormEvent) => {
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
            <span
              className="gradient-brand inline-flex h-9 w-9 items-center justify-center rounded-lg text-white"
              style={{ boxShadow: "var(--shadow-surface-1)" }}
            >
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
      <div
        className="rounded-xl border border-slate-200 bg-white p-6"
        style={{ boxShadow: "var(--shadow-surface-2)" }}
      >
        {/* Help Banner */}
        <div className="glass mb-5 flex items-start gap-3 rounded-lg p-3.5 text-xs text-slate-700">
          <Zap className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--color-primary)" }} />
          <div className="leading-relaxed">
            <strong>Powered by Bright Data Web Scraper API:</strong> Provide any public LinkedIn profile URL (e.g.{" "}
            <code className="rounded bg-white/60 px-1 py-0.5 font-mono text-[11px]">
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
                className="input-glow w-full rounded-lg border border-slate-300 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0f4c81] focus:outline-none focus:ring-1 focus:ring-[#0f4c81] disabled:bg-slate-50 disabled:text-slate-500"
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
            <div
              className="rounded-lg border border-slate-200 p-4 space-y-5"
              style={{ background: "var(--surface-muted)" }}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                <span className="flex items-center gap-2">
                  <div
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent"
                    style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
                  />
                  Bright Data Scraper In Progress...
                </span>
                <span className="text-slate-500 font-mono text-[11px]">
                  {progressStep === 1 && "Connecting (25%)"}
                  {progressStep === 2 && "Scraping Profile (60%)"}
                  {progressStep === 3 && "Structuring Tables (85%)"}
                  {progressStep === 4 && "Finalizing (100%)"}
                </span>
              </div>

              {/* Animated progress rail */}
              <div className="relative px-1 pt-1">
                <div
                  className="absolute left-5 right-5 top-[15px] h-0.5 rounded-full"
                  style={{ background: "var(--border-strong)" }}
                />
                <motion.div
                  className="absolute left-5 top-[15px] h-0.5 rounded-full"
                  style={{ background: "var(--gradient-brand)" }}
                  initial={false}
                  animate={{ width: `calc((100% - 2.5rem) * ${railFillPercent / 100})` }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: "easeInOut" }}
                />

                <div className="relative grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                  {PROGRESS_STEPS.map((step) => {
                    const done = progressStep > step.threshold;
                    const active = progressStep === step.threshold;
                    const reached = progressStep >= step.threshold;
                    return (
                      <div key={step.label} className="flex flex-col items-center gap-1.5 text-center">
                        <motion.div
                          className="flex h-7 w-7 items-center justify-center rounded-full border-2"
                          style={{
                            background: reached ? "var(--surface)" : "var(--surface-muted)",
                            borderColor: reached ? "var(--color-success)" : "var(--border-strong)",
                          }}
                          animate={
                            active && !reduceMotion
                              ? { scale: [1, 1.18, 1] }
                              : { scale: 1 }
                          }
                          transition={
                            active && !reduceMotion
                              ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                              : { duration: 0.2 }
                          }
                        >
                          <CheckCircle2
                            className="h-4 w-4"
                            style={{ color: reached ? "var(--color-success)" : "var(--border-strong)" }}
                          />
                        </motion.div>
                        <span className={reached ? "font-medium text-slate-900" : "opacity-60"}>
                          {step.label}
                        </span>
                        {done && (
                          <span
                            className="text-[10px] font-semibold"
                            style={{ color: "var(--color-success)" }}
                          >
                            Done
                          </span>
                        )}
                      </div>
                    );
                  })}
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
              className={`cta-primary inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
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
