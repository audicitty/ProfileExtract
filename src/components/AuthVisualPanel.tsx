"use client";

import { motion, useReducedMotion } from "motion/react";
import { Briefcase, CheckCircle2, FileText, ShieldCheck } from "lucide-react";

export function AuthVisualPanel({ title, subtitle }: { title: string; subtitle: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="aurora-bg relative hidden min-h-[420px] overflow-hidden rounded-3xl lg:flex lg:flex-col lg:justify-between lg:p-8">
      <div className="relative z-10 space-y-3">
        <div
          className="gradient-brand inline-flex h-10 w-10 items-center justify-center rounded-lg text-white"
          style={{ boxShadow: "var(--shadow-surface-1)" }}
        >
          <FileText className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        <p className="max-w-xs text-sm text-slate-600">{subtitle}</p>
      </div>

      <div className="relative z-10 mt-10 h-44 shrink-0">
        <motion.div
          className="glass absolute left-2 top-2 flex h-20 w-52 items-center gap-3 rounded-2xl px-4"
          style={{ rotate: -6 }}
          animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}
          >
            <Briefcase className="h-4 w-4" />
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-20 rounded-full bg-slate-300/70" />
            <div className="h-2 w-14 rounded-full bg-slate-300/50" />
          </div>
        </motion.div>

        <motion.div
          className="glass absolute right-2 top-24 flex h-14 w-44 items-center gap-2 rounded-xl px-3"
          style={{ rotate: 5 }}
          animate={reduceMotion ? undefined : { y: [0, 10, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        >
          <CheckCircle2 className="h-4 w-4" style={{ color: "var(--color-success)" }} />
          <span className="text-[10px] font-semibold text-slate-600">Verified Company Profile</span>
        </motion.div>
      </div>

      <div className="relative z-10 flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: "var(--color-primary)" }} />
        <span>Candidate profiles and resumes are never persisted — only your account credentials are stored, securely.</span>
      </div>
    </div>
  );
}
