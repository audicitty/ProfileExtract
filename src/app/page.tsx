import Link from "next/link";
import {
  Download,
  Table,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
} from "lucide-react";

export const metadata = {
  title: "ProfileExtract — Clean Structured LinkedIn Profile Data & CSV",
  description:
    "Paste raw visible text from any LinkedIn profile and receive structured data in a table with one-click CSV export.",
};

export default function LandingPage() {
  return (
    <div className="space-y-16 py-8 sm:py-16">
      {/* Hero Section */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1 text-xs font-semibold text-[#0f4c81]">
          <Zap className="h-3.5 w-3.5" />
          <span>Stateless AI Profile Structurer &bull; Free Forever</span>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl sm:leading-tight">
          Turn Raw LinkedIn Profile Text Into Clean, Structured Data &amp; CSV
        </h1>

        <p className="mx-auto max-w-2xl text-base text-slate-600 sm:text-lg">
          No brittle scrapers or browser extensions. Copy visible text directly from any profile,
          paste it into ProfileExtract, and get normalized fields with one-click CSV export.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/signup"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f4c81] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a365c]"
          >
            <span>Start Extracting Free</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Sign In
          </Link>
        </div>

        {/* Feature Highlights Pills */}
        <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Zero scraping risk</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>No data persistence</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>RFC-4180 CSV export</span>
          </div>
        </div>
      </section>

      {/* 3-Step Process Cards */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-2 mb-10">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Simple 3-Step Workflow
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            From unformatted clipboard text to clean spreadsheets in under 5 seconds
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Step 1 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[#0f4c81] font-bold text-sm">
              01
            </div>
            <h3 className="font-bold text-slate-900 text-base">Select &amp; Copy</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Open any LinkedIn profile, press <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800 border border-slate-200">Ctrl+A</kbd> to select all visible content, and copy it to your clipboard.
            </p>
          </div>

          {/* Step 2 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[#0f4c81] font-bold text-sm">
              02
            </div>
            <h3 className="font-bold text-slate-900 text-base">Paste &amp; Structure</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Paste the text into the extraction workspace. Our schema-enforced AI normalizes experience, education, and skills without hallucination.
            </p>
          </div>

          {/* Step 3 */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[#0f4c81] font-bold text-sm">
              03
            </div>
            <h3 className="font-bold text-slate-900 text-base">Download CSV</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Instantly review the structured table and click to download a clean, properly escaped CSV ready for your spreadsheet or CRM.
            </p>
          </div>
        </div>
      </section>

      {/* Schema & Output Preview Section */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Fixed, Schema-Enforced Extraction Output
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Guaranteed schema adherence with strict zero-hallucination accuracy rules
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                <Table className="h-3.5 w-3.5" /> Structured Table
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                <Download className="h-3.5 w-3.5" /> Native CSV
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3.5 space-y-1">
              <span className="font-bold text-slate-900">Contact &amp; Overview</span>
              <p className="text-slate-600">First Name, Last Name, Headline, Current Title, Company, Location, About</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3.5 space-y-1">
              <span className="font-bold text-slate-900">Work Experience</span>
              <p className="text-slate-600">Company, Title, Chronological Duration, Formatted Role Descriptions</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3.5 space-y-1">
              <span className="font-bold text-slate-900">Education &amp; Degrees</span>
              <p className="text-slate-600">Institutions, Degrees / Fields of Study, Attendance Years</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3.5 space-y-1">
              <span className="font-bold text-slate-900">Skills &amp; Projects</span>
              <p className="text-slate-600">Categorized Skills, Project Names &amp; Details, Certifications</p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy & Security Callout */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-[#0f4c81] shadow-sm">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">
          Privacy-First Architecture: 100% Stateless Extraction
        </h3>
        <p className="mx-auto max-w-xl text-xs sm:text-sm text-slate-600 leading-relaxed">
          We never store, log, or persist the LinkedIn profile text you submit. Data exists only in your active browser session memory and is transformed synchronously on demand.
        </p>

        <div className="pt-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c81] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a365c]"
          >
            <span>Get Started with ProfileExtract</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
