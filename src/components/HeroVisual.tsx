"use client";

import { useRef, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "motion/react";
import { FileText, Briefcase, CheckCircle2 } from "lucide-react";

export function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 120, damping: 20 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), { stiffness: 120, damping: 20 });

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    if (reduceMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handleMouseLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="absolute inset-0 z-0 hidden lg:block"
      style={{ perspective: 1400 }}
      aria-hidden="true"
    >
      <motion.div
        style={{
          rotateX: reduceMotion ? 0 : rotateX,
          rotateY: reduceMotion ? 0 : rotateY,
          transformStyle: "preserve-3d",
        }}
        className="relative h-full w-full"
      >
        <motion.div
          className="glass absolute left-[4%] top-[18%] flex h-24 w-60 items-center gap-3 rounded-2xl px-4"
          style={{ rotate: -8 }}
          animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="gradient-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white">
            <FileText className="h-4 w-4" />
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-24 rounded-full bg-slate-300/70" />
            <div className="h-2 w-16 rounded-full bg-slate-300/50" />
          </div>
        </motion.div>

        <motion.div
          className="glass absolute right-[6%] top-[8%] flex h-24 w-60 items-center gap-3 rounded-2xl px-4"
          style={{ rotate: 6 }}
          animate={reduceMotion ? undefined : { y: [0, 12, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}
          >
            <Briefcase className="h-4 w-4" />
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-20 rounded-full bg-slate-300/70" />
            <div className="h-2 w-28 rounded-full bg-slate-300/50" />
          </div>
        </motion.div>

        <motion.div
          className="glass absolute bottom-[14%] right-[16%] flex h-14 w-44 items-center gap-2 rounded-xl px-3"
          style={{ rotate: 3 }}
          animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
        >
          <CheckCircle2 className="h-4 w-4" style={{ color: "var(--color-success)" }} />
          <span className="text-[10px] font-semibold text-slate-600">92% Match Score</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
