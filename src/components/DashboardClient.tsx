"use client";

import { useState, useTransition, useRef } from "react";
import { ProfileData } from "@/lib/types";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { ProfileResults } from "@/components/ProfileResults";
import {
  Sparkles,
  AlertCircle,
  RotateCcw,
  Trash2,
  FileText,
  HelpCircle,
} from "lucide-react";

const SAMPLE_LINKEDIN_TEXT = `Sarah Jenkins, Ph.D.
Lead AI Research Engineer & Systems Architect | Distributed ML Systems
San Francisco Bay Area · Contact info
500+ connections

About
Passionate AI Research Engineer with 8+ years of experience designing scalable machine learning pipelines, LLM fine-tuning workflows, and distributed inference engines. Led multi-disciplinary teams across Silicon Valley high-growth startups and research labs. Advocate for open-source AI and high-performance computing.

Experience
Lead AI Research Engineer
Anthropic / Scale AI Solutions · Full-time
Jan 2022 - Present · 3 yrs
San Francisco, California
• Architected high-throughput distributed inference clustering reducing p99 latency by 42%.
• Spearheaded internal RLHF training harness supporting 70B+ parameter model evaluations.
• Mentored a team of 6 senior machine learning and infrastructure engineers.

Senior Machine Learning Engineer
DeepScale Technologies
Aug 2019 - Dec 2021 · 2 yrs 5 mos
Palo Alto, CA
• Designed real-time embedding pipelines handling 150k QPS using PyTorch, Triton, and Redis.
• Optimized CUDA kernels for sparse matrix multiplications, saving $350k/year in GPU cluster costs.
• Published 2 research papers at NeurIPS and ICML on efficient model quantization.

Education
Stanford University
Doctor of Philosophy - PhD, Computer Science (Machine Learning)
2015 - 2019

University of California, Berkeley
Bachelor of Science - BS, Electrical Engineering & Computer Science (EECS)
2011 - 2015

Projects
OpenTensor-Inference
High-performance C++/CUDA inference runtime for large multimodal models with INT4/FP8 quantization.

NeuralGraph-Dist
Distributed graph neural network training engine for massive knowledge graphs with multi-GPU scaling.

Licenses & Certifications
AWS Certified Solutions Architect – Professional
Amazon Web Services (AWS) · Issued Nov 2022

NVIDIA Certified Deep Learning Institute Instructor
NVIDIA · Issued Mar 2020

Skills
Distributed Systems · Large Language Models (LLMs) · PyTorch · CUDA · Python · C++ · Triton Server · Docker · Kubernetes · High Performance Computing (HPC) · Git · MLOps · System Architecture`;

export function DashboardClient() {
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [, startTransition] = useTransition();
  const resultsRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = rawText.length;

  const handleSampleLoad = () => {
    setRawText(SAMPLE_LINKEDIN_TEXT);
    setError(null);
  };

  const handleClear = () => {
    setRawText("");
    setError(null);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation: must be non-empty and at least 100 characters
    const trimmed = rawText.trim();
    if (!trimmed) {
      setError("Please paste the LinkedIn profile text before structuring.");
      return;
    }

    if (trimmed.length < 100) {
      setError(
        `Pasted text is too short (${trimmed.length} characters). Please copy the full visible profile text from LinkedIn (minimum 100 characters).`
      );
      return;
    }

    // Reset error & immediately set optimistic loading state within 100ms
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rawText: trimmed }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "Couldn't process that text — please check it was copied correctly and try again."
        );
      }

      startTransition(() => {
        setProfile(data.data);
        setLoading(false);
      });

      // Smooth scroll to results on completion
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err: unknown) {
      setLoading(false);
      const msg =
        err instanceof Error
          ? err.message
          : "Couldn't process that text — please check it was copied correctly and try again.";
      setError(msg);
    }
  };

  const handleReset = () => {
    setProfile(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header & Instructions */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Profile Extraction Workspace
        </h1>
        <p className="text-sm text-slate-600">
          Extract, normalize, and export LinkedIn profile data into clean structured tables and CSV.
        </p>
      </div>

      {/* Input Section Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        {/* Instruction Banner */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900">
          <HelpCircle className="h-4 w-4 text-[#0f4c81] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-[#0f4c81]">How it works:</span> Go to any
            LinkedIn profile in your browser &rarr; select all visible content (
            <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-mono border border-blue-200 text-blue-950">
              Ctrl+A
            </kbd>{" "}
            or{" "}
            <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-mono border border-blue-200 text-blue-950">
              Cmd+A
            </kbd>
            ) &rarr; copy (
            <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-mono border border-blue-200 text-blue-950">
              Ctrl+C
            </kbd>
            ) &rarr; paste the raw text below.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="profile-text"
                className="text-xs font-semibold uppercase tracking-wider text-slate-700"
              >
                Paste your LinkedIn profile text here
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSampleLoad}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0f4c81] hover:underline"
                >
                  <FileText className="h-3 w-3" />
                  Load Sample
                </button>
                {rawText && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Dominant Multi-line Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                id="profile-text"
                rows={12}
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                placeholder="Example: Sarah Jenkins... Experience... Lead Software Engineer at Acme Corp... Education... Stanford University... Skills... Python, React, PostgreSQL..."
                className={`w-full rounded-lg border p-4 text-xs sm:text-sm font-mono text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f4c81] transition resize-y ${
                  error
                    ? "border-red-300 bg-red-50/20 focus:ring-red-500"
                    : "border-slate-300 bg-white"
                } ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
              />
            </div>

            {/* Character count & status helper */}
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Minimum 100 characters required</span>
              <span
                className={
                  charCount > 0 && charCount < 100
                    ? "text-amber-600 font-medium"
                    : "text-slate-500"
                }
              >
                {charCount.toLocaleString()} character{charCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {/* Inline Error Message */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">Unable to structure profile</p>
                <p className="mt-0.5 text-red-700 leading-relaxed">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-xs font-semibold text-red-600 hover:text-red-900"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500">
              Stateless extraction &bull; No data stored on server
            </div>

            <button
              type="submit"
              disabled={loading || !rawText.trim()}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f4c81] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a365c] focus:outline-none focus:ring-2 focus:ring-[#0f4c81] focus:ring-offset-2 ${
                loading || !rawText.trim() ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Structuring Profile...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Structure Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Results / Skeleton Anchor */}
      <div ref={resultsRef} className="pt-2">
        {loading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <div className="h-2 w-2 rounded-full bg-[#0f4c81] animate-ping" />
              <span>Analyzing text and extracting structured profile entities with Gemini...</span>
            </div>
            <LoadingSkeleton />
          </div>
        )}

        {!loading && profile && (
          <ProfileResults profile={profile} onReset={handleReset} />
        )}

        {!loading && !profile && !error && (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
            <p className="text-xs text-slate-400">
              Paste profile text above and click &quot;Structure Profile&quot; to generate structured tables and CSV export.
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="flex justify-center pt-2">
            <button
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0f4c81] hover:underline"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry extraction</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
