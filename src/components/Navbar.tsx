"use client";

import Link from "next/link";
import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { FileText, LogOut, User as UserIcon } from "lucide-react";

export function Navbar() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-slate-900 transition hover:opacity-90">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0f4c81] text-white shadow-sm">
            <FileText className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-slate-900 leading-none">
              ProfileExtract
            </span>
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">
              LinkedIn Data Structurer
            </span>
          </div>
        </Link>

        {/* Navigation & Auth Status */}
        <div className="flex items-center gap-3 sm:gap-4">
          {isPending ? (
            <div className="h-8 w-20 animate-pulse rounded bg-slate-100" />
          ) : session?.user ? (
            <>
              <Link
                href="/dashboard"
                className="hidden sm:inline-flex text-sm font-medium text-slate-600 hover:text-slate-900 transition"
              >
                Text Extractor
              </Link>
              <Link
                href="/url-extract"
                className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
              >
                <span>URL Extractor</span>
              </Link>
              <Link
                href="/jobs"
                className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-[#0f4c81] hover:text-[#0a365c] transition"
              >
                <span>Job Matcher</span>
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
                  AI
                </span>
              </Link>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                <UserIcon className="h-3.5 w-3.5 text-slate-500" />
                <span className="max-w-[150px] truncate">{session.user.email}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:text-slate-900 hover:bg-slate-100"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-md bg-[#0f4c81] px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#0a365c]"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
