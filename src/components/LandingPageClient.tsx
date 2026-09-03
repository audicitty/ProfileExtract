"use client";

import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Globe,
  Briefcase,
  Sparkles,
  MapPin,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { TiltCard } from "@/components/TiltCard";
import { HeroVisual } from "@/components/HeroVisual";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const proofPoints = [
  { icon: Globe, label: "Live LinkedIn Job Data" },
  { icon: Sparkles, label: "Gemini AI Skill Matching" },
  { icon: CheckCircle2, label: "Verified Company Profiles" },
  { icon: MapPin, label: "11 Indian IT Hubs Covered" },
];

export function LandingPageClient() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : "hidden";

  return (
    <div className="space-y-16 py-8 sm:py-16">
      {/* Hero Section */}
      <section className="aurora-bg relative">
        <HeroVisual />
        <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-6 py-10 sm:py-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1 text-xs font-semibold text-[#0f4c81]">
            <Zap className="h-3.5 w-3.5" />
            <span>Next-Gen Career &amp; LinkedIn Intelligence Platform</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl sm:leading-tight">
            Scrape LinkedIn Profiles by URL &amp; Match Jobs with AI
          </h1>

          <p className="mx-auto max-w-2xl text-base text-slate-600 sm:text-lg">
            Extract full, structured profile data directly from any public LinkedIn URL, or scan your resume to discover verified, live job postings in top Indian IT hubs with direct apply links.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/signup"
              className="cta-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold"
            >
              <span>Get Started Free</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="cta-secondary w-full sm:w-auto inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold"
            >
              Sign In
            </Link>
          </div>

          {/* Feature Highlights Pills */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Direct LinkedIn URL Scraper</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Live Job Postings (Bangalore, NCR, etc.)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>RFC-4180 CSV Export</span>
            </div>
          </div>

          {/* Qualitative proof row — no invented metrics, just documented capabilities */}
          <motion.div
            initial={initial}
            whileInView="visible"
            viewport={{ once: true, amount: 0.4 }}
            variants={fadeUp}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
            className="flex flex-wrap items-center justify-center gap-3 pt-2"
          >
            {proofPoints.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-slate-600"
              >
                <Icon className="h-3.5 w-3.5" style={{ color: "var(--color-primary)" }} />
                {label}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Two Flagship Features Cards */}
      <motion.section
        initial={initial}
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={staggerContainer}
        className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Feature 1: URL Extractor */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5, ease: "easeOut" }}>
            <TiltCard className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-4 shadow-[var(--shadow-surface-1)] transition-shadow duration-300 hover:shadow-[var(--shadow-surface-3)] hover:border-slate-300">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: "var(--gradient-brand)" }} />
              <div
                className="pointer-events-none absolute inset-0 -z-10 opacity-60"
                style={{ background: "linear-gradient(160deg, var(--color-primary-soft) 0%, transparent 55%)" }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#0f4c81]">
                <Globe className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">URL Profile Extractor</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Paste any public LinkedIn profile URL. The engine fetches full profile attributes, normalizes employment history, education, and credentials, and enriches skills using Gemini AI.
              </p>
              <ul className="space-y-1.5 text-xs text-slate-600 pt-1">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Zero browser extensions required</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Automated AI skills categorization</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Single-click tabular CSV download</span>
                </li>
              </ul>
              <div className="pt-2">
                <Link
                  href="/url-extract"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0f4c81] hover:underline"
                >
                  <span>Launch URL Extractor</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </TiltCard>
          </motion.div>

          {/* Feature 2: AI Resume Scanner & Job Matcher */}
          <motion.div variants={fadeUp} transition={{ duration: 0.5, ease: "easeOut" }}>
            <TiltCard className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-4 shadow-[var(--shadow-surface-1)] transition-shadow duration-300 hover:shadow-[var(--shadow-surface-3)] hover:border-slate-300">
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: "linear-gradient(90deg, var(--color-success) 0%, var(--color-secondary) 100%)" }}
              />
              <div
                className="pointer-events-none absolute inset-0 -z-10 opacity-60"
                style={{ background: "linear-gradient(160deg, var(--color-success-soft) 0%, transparent 55%)" }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Briefcase className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">AI Resume Scanner &amp; Job Matcher</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Upload a PDF resume or paste text. Gemini AI extracts your exact qualifications, identifies target roles, queries live active openings across Indian IT hubs, and scores your fit.
              </p>
              <ul className="space-y-1.5 text-xs text-slate-600 pt-1">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Multi-city selection (Bangalore, Gurgaon, Noida, Jaipur, etc.)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Direct 100% active LinkedIn apply links</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Salary insights in INR LPA &amp; skill gaps breakdown</span>
                </li>
              </ul>
              <div className="pt-2">
                <Link
                  href="/jobs"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0f4c81] hover:underline"
                >
                  <span>Launch Job Matcher</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </TiltCard>
          </motion.div>
        </div>
      </motion.section>

      {/* Privacy & Security Callout */}
      <motion.section
        initial={initial}
        whileInView="visible"
        viewport={{ once: true, amount: 0.4 }}
        variants={fadeUp}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-4"
      >
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-[#0f4c81] shadow-sm">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">
          Privacy-First Architecture: Zero Data Persistence
        </h3>
        <p className="mx-auto max-w-xl text-xs sm:text-sm text-slate-600 leading-relaxed">
          We never store or persist candidate profiles, scraped data, or uploaded resumes. All intelligence is computed on-demand and exists only in your active session.
        </p>

        <div className="pt-4">
          <Link
            href="/signup"
            className="cta-primary inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold"
          >
            <span>Get Started Free</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </motion.section>
    </div>
  );
}
