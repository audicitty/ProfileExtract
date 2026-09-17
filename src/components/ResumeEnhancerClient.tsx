"use client";

import { useEffect, useState } from "react";
import {
  ResumeIntake,
  SAMPLE_RESUME_TEXT,
  type ResumeIntakePayload,
} from "@/components/ResumeIntake";
import {
  clearEnhanceTargetJob,
  readEnhanceTargetJob,
  type EnhanceTargetJob,
} from "@/lib/resume-enhance-target";
import type {
  AtsSeverity,
  ResumeEnhanceResult,
  ResumeIssue,
} from "@/lib/types";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Briefcase,
  Check,
  ClipboardCopy,
  FileText,
  Info,
  Sparkles,
  Target,
  Wand2,
  XCircle,
} from "lucide-react";

const SEVERITY_ORDER: AtsSeverity[] = ["critical", "warning", "minor"];

const SEVERITY_STYLE: Record<
  AtsSeverity,
  { label: string; badge: string; card: string; icon: React.ReactNode }
> = {
  critical: {
    label: "Critical",
    badge: "bg-red-100 text-red-800 border-red-200",
    card: "border-red-200 bg-red-50/50",
    icon: <XCircle className="h-4 w-4 text-red-600" />,
  },
  warning: {
    label: "Warning",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    card: "border-amber-200 bg-amber-50/50",
    icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  },
  minor: {
    label: "Minor",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    card: "border-slate-200 bg-slate-50",
    icon: <Info className="h-4 w-4 text-slate-500" />,
  },
};

const CATEGORY_LABEL: Record<string, string> = {
  parseability: "Parseability",
  structure: "Structure",
  layout: "Layout",
  contact: "Contact",
  dates: "Dates",
};

function scoreTone(score: number): string {
  if (score >= 85) return "text-emerald-700";
  if (score >= 70) return "text-amber-700";
  return "text-red-700";
}

export function ResumeEnhancerClient() {
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResumeEnhanceResult | null>(null);

  // One piece of state, so the mount-time handoff read below is a single setState.
  const [target, setTarget] = useState<{ job: EnhanceTargetJob | null; jd: string }>({
    job: null,
    jd: "",
  });
  const { job: targetJob, jd: targetJd } = target;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Picks up an "Optimize for this job" handoff from the Job Matcher. sessionStorage
  // cannot be read during render — there is none on the server, and seeding state from
  // it while rendering would desync hydration — so this is a deliberate mount-time read.
  useEffect(() => {
    const handoff = readEnhanceTargetJob();
    if (!handoff) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget({ job: handoff, jd: handoff.description });
    clearEnhanceTargetJob();
  }, []);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      setError("Your browser blocked clipboard access. Select the text and copy it manually.");
    }
  };

  const handleEnhance = async (payload: ResumeIntakePayload) => {
    setError(null);
    setEnhancing(true);

    try {
      const res = await fetch("/api/resume/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          targetJobDescription: targetJd.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to analyse the resume. Please try again.");
      }

      setResult(data.data as ResumeEnhanceResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to analyse the resume.";
      setError(msg);
    } finally {
      setEnhancing(false);
    }
  };

  const audit = result?.audit ?? null;
  const content = result?.content ?? null;

  const issuesBySeverity = SEVERITY_ORDER.map((severity) => ({
    severity,
    issues: (audit?.issues ?? []).filter((issue) => issue.severity === severity),
  })).filter((group) => group.issues.length > 0);

  const failedContentChecks = (content?.findings ?? []).filter((f) => !f.passed);
  const passedContentChecks = (content?.findings ?? []).filter((f) => f.passed);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f4c81] text-white shadow-sm">
              <Wand2 className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Resume Enhancer &amp; ATS Audit
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Structural checks are weighted by measured parser behaviour; content findings
            are judgement and carry no score. Nothing you upload is stored.
          </p>
        </div>
      </div>

      {/* Step 1: Resume intake */}
      <ResumeIntake
        heading="Provide Your Resume for the ATS Audit"
        stepLabel="1"
        onSubmit={handleEnhance}
        busy={enhancing}
        submitLabel="Audit & Enhance Resume"
        busyLabel="Auditing resume..."
        submitIcon={<Sparkles className="h-3.5 w-3.5" />}
        error={error}
        onError={setError}
        errorTitle="Audit Error"
        sampleText={SAMPLE_RESUME_TEXT}
        onClear={() => setResult(null)}
      >
        <p className="text-[11px] text-slate-500">
          Upload the PDF you actually send to employers — layout, columns and headings can
          only be measured on the file itself. Pasted text is reviewed for content only.
        </p>
      </ResumeIntake>

      {/* Step 2: Target job description */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f4c81] text-xs font-bold text-white">
              2
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Target Job Description (Optional)
            </h2>
          </div>
          {targetJd && (
            <button
              type="button"
              onClick={() => {
                setTarget({ job: null, jd: "" });
              }}
              className="text-xs text-slate-400 hover:text-slate-600 transition"
            >
              Clear target job
            </button>
          )}
        </div>

        {targetJob && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-slate-700">
            <Briefcase className="h-3.5 w-3.5 text-[#0f4c81]" />
            <span>
              Optimising for <strong>{targetJob.title}</strong>
              {targetJob.company ? ` at ${targetJob.company}` : ""} — pulled from your job
              matches.
            </span>
          </div>
        )}

        <textarea
          value={targetJd}
          onChange={(e) => setTarget((prev) => ({ ...prev, jd: e.target.value }))}
          placeholder="Paste the job description you are targeting. Keywords it needs that your resume never mentions are matched on token boundaries, not guessed."
          rows={4}
          disabled={enhancing}
          className="w-full rounded-lg border border-slate-300 p-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0f4c81] focus:outline-none focus:ring-1 focus:ring-[#0f4c81] disabled:bg-slate-50 font-mono"
        />
      </div>

      {enhancing && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-2">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#0f4c81] border-t-transparent" />
          <p className="text-xs text-slate-500">
            Reading the file structure, then reviewing the writing.
          </p>
        </div>
      )}

      {/* Results */}
      {!enhancing && result && content && (
        <div className="space-y-6">
          {/* Score + sub-scores */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Award className="h-8 w-8 text-[#0f4c81]" />
                <div>
                  {audit && audit.ats_score !== null ? (
                    <>
                      <div className={`text-3xl font-bold leading-none ${scoreTone(audit.ats_score)}`}>
                        {audit.ats_score}
                        <span className="text-base font-semibold text-slate-400">/100</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        ATS structure score &bull; {audit.registry.checks_run} checks, weights
                        measured {new Date(audit.registry.bench_run_at).toISOString().slice(0, 10)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-bold text-slate-800">No structure score</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {result.audit_skipped_reason === "text_input"
                          ? "Pasted text has no layout to measure — upload the PDF for the structural audit."
                          : result.audit_skipped_reason === "pdf_unreadable"
                          ? "That PDF could not be read for structure; the content review below still ran."
                          : "This PDF carries no text layer. Re-export it as a text PDF rather than a scan."}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {audit && Object.keys(audit.sub_scores).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(audit.sub_scores).map(([category, value]) => (
                    <div
                      key={category}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center min-w-[92px]"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {CATEGORY_LABEL[category] ?? category}
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {typeof value === "number" ? value : "n/a"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-3">
              Content findings below are judgement calls and deliberately carry no points —
              no bench measurement exists for them.
            </p>
          </div>

          {/* Structural issues grouped by severity */}
          {issuesBySeverity.length > 0 && (
            <div className="space-y-4">
              {issuesBySeverity.map(({ severity, issues }) => (
                <div key={severity} className="space-y-3">
                  <div className="flex items-center gap-2">
                    {SEVERITY_STYLE[severity].icon}
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                      {SEVERITY_STYLE[severity].label} &mdash; {issues.length}
                    </h2>
                  </div>

                  {issues.map((issue: ResumeIssue) => (
                    <div
                      key={issue.check_id}
                      className={`rounded-xl border p-4 space-y-2 ${SEVERITY_STYLE[severity].card}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEVERITY_STYLE[severity].badge}`}
                        >
                          &minus;{issue.severity_points} pts
                        </span>
                        <span className="rounded bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                          {CATEGORY_LABEL[issue.category] ?? issue.category}
                        </span>
                        {issue.confidence === "single-parser" && (
                          <span className="rounded bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                            Low confidence &bull; one parser only
                          </span>
                        )}
                        {issue.section && (
                          <span className="text-[11px] text-slate-500">{issue.section}</span>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-slate-900">{issue.problem}</p>
                      <p className="text-xs text-slate-700">{issue.fix}</p>

                      {issue.evidence.length > 0 && (
                        <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                          {issue.evidence.slice(0, 4).map((line, idx) => (
                            <li key={idx} className="font-mono">{line}</li>
                          ))}
                        </ul>
                      )}

                      {issue.caveat && (
                        <p className="text-[11px] italic text-slate-500">
                          Caveat: {issue.caveat}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Content findings */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileText className="h-4 w-4 text-[#0f4c81]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Content Review (Unscored)
              </h2>
            </div>

            {failedContentChecks.length === 0 ? (
              <p className="text-xs text-slate-600">
                Nothing flagged on verbs, quantification, buzzwords, tense or keywords.
              </p>
            ) : (
              <div className="space-y-3">
                {failedContentChecks.map((finding) => (
                  <div
                    key={finding.check_id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-white px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-600 border border-slate-200">
                        {finding.check_id}
                      </span>
                      {finding.section && (
                        <span className="text-[11px] text-slate-500">{finding.section}</span>
                      )}
                    </div>
                    {finding.statement && (
                      <p className="text-[11px] text-slate-500">{finding.statement}</p>
                    )}
                    <p className="text-xs font-semibold text-slate-900">{finding.problem}</p>
                    {finding.excerpt && (
                      <p className="rounded bg-white border border-slate-200 px-2.5 py-1.5 text-[11px] font-mono text-slate-700">
                        &ldquo;{finding.excerpt}&rdquo;
                      </p>
                    )}
                    <p className="text-xs text-slate-700">{finding.fix}</p>
                  </div>
                ))}
              </div>
            )}

            {passedContentChecks.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                {passedContentChecks.map((finding) => (
                  <span
                    key={finding.check_id}
                    className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-800"
                  >
                    <Check className="h-3 w-3" />
                    {finding.check_id}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Summary rewrite */}
          {content.summary_rewrite && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#0f4c81]" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                    Summary {content.summary_present ? "Rewrite" : "Draft"}
                  </h2>
                  {!content.summary_strong && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Current summary is weak
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => copy("summary", content.summary_rewrite)}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  {copiedKey === "summary" ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <ClipboardCopy className="h-3 w-3" />
                  )}
                  <span>{copiedKey === "summary" ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <p className="text-xs text-slate-800 leading-relaxed">{content.summary_rewrite}</p>
            </div>
          )}

          {/* Copyable bullet rewrites */}
          {content.bullet_rewrites.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Wand2 className="h-4 w-4 text-[#0f4c81]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Rewritten Bullets ({content.bullet_rewrites.length})
                </h2>
              </div>

              <div className="space-y-3">
                {content.bullet_rewrites.map((rewrite, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 p-3.5 space-y-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Before
                      </span>
                      <p className="text-[11px] text-slate-600 line-through decoration-slate-300">
                        {rewrite.original}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                        After
                      </span>
                      <p className="text-xs font-medium text-slate-900">{rewrite.improved}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <p className="text-[11px] text-slate-500">{rewrite.rationale}</p>
                      <button
                        type="button"
                        onClick={() => copy(`bullet-${idx}`, rewrite.improved)}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                      >
                        {copiedKey === `bullet-${idx}` ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <ClipboardCopy className="h-3 w-3" />
                        )}
                        <span>{copiedKey === `bullet-${idx}` ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Keyword gaps */}
          {content.target_jd_provided && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Target className="h-4 w-4 text-[#0f4c81]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Keyword Gaps vs Target Job
                </h2>
              </div>

              {content.keyword_gaps.length === 0 ? (
                <p className="text-xs text-slate-600">
                  Every skill the posting names already appears in your resume.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {content.keyword_gaps.map((gap) => (
                      <span
                        key={gap}
                        className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                      >
                        {gap}
                      </span>
                    ))}
                  </div>

                  {content.keyword_placements.length > 0 && (
                    <ul className="space-y-2 text-xs text-slate-700">
                      {content.keyword_placements.map((placement, idx) => (
                        <li key={idx} className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                          <strong className="text-slate-900">{placement.keyword}</strong>
                          {placement.section ? ` — ${placement.section}: ` : " — "}
                          {placement.suggestion}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="text-[11px] text-slate-500">
                    Gaps are matched on token boundaries against your resume text. Only add a
                    keyword you can honestly back up in an interview.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Section analysis */}
          {content.section_analysis.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <AlertCircle className="h-4 w-4 text-[#0f4c81]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Sections a Parser Found
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {content.section_analysis.map((section) => (
                  <div
                    key={section.section}
                    className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5"
                  >
                    {section.present ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                    )}
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{section.section}</div>
                      <div className="text-[11px] text-slate-500">{section.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plain-text ATS-safe version */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#0f4c81]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Plain-Text ATS-Safe Version
                </h2>
              </div>
              <button
                type="button"
                onClick={() => copy("ats-text", result.ats_safe_text)}
                className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                {copiedKey === "ats-text" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <ClipboardCopy className="h-3 w-3" />
                )}
                <span>{copiedKey === "ats-text" ? "Copied" : "Copy all"}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Your words, re-flowed: decorative glyphs removed, bullets normalised. Paste it
              into an application box that mangles formatted resumes.
            </p>
            <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-[11px] font-mono text-slate-700 whitespace-pre-wrap">
              {result.ats_safe_text}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
