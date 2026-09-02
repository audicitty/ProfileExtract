import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { searchLinkedInJobs, scoreJobsWithResume } from "@/lib/jobs";
import { JobSearchFilters, ParsedResume } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // 1. Session verification
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in to search jobs." },
        { status: 401 }
      );
    }

    // 2. Request payload validation
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload in request." },
        { status: 400 }
      );
    }

    const { filters, resumeProfile } = body || {};

    const cleanFilters: JobSearchFilters = {
      keywords: String(filters?.keywords || "").trim() || "Software Engineer",
      location: String(filters?.location || "").trim() || "Remote",
      workplace_type: ["all", "remote", "hybrid", "onsite"].includes(filters?.workplace_type)
        ? filters.workplace_type
        : "all",
      date_posted: ["all", "past_24h", "past_week", "past_month"].includes(filters?.date_posted)
        ? filters.date_posted
        : "all",
      experience_level: ["all", "entry", "mid", "senior"].includes(filters?.experience_level)
        ? filters.experience_level
        : "all",
    };

    // 3. Search jobs using Bright Data dataset or AI discovery engine
    let jobs = await searchLinkedInJobs(cleanFilters, resumeProfile as ParsedResume | undefined);

    // 4. If resume is present, compute candidate match score & strength/gap analysis
    if (resumeProfile && Array.isArray(resumeProfile.extracted_skills)) {
      jobs = scoreJobsWithResume(jobs, resumeProfile as ParsedResume);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          jobs,
          total: jobs.length,
          filters_applied: cleanFilters,
          resume_matched: Boolean(resumeProfile),
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to search LinkedIn jobs. Please try adjusting your filters.";

    console.error("API /api/jobs/search error:", err);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
