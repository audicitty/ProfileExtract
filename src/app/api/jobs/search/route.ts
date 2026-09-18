import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  searchLinkedInJobs,
  scoreJobsWithResume,
  normaliseJobSearchFilters,
} from "@/lib/jobs";
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

    // Shared with the chat `search_jobs` tool — one definition of a valid filter set.
    const cleanFilters: JobSearchFilters = normaliseJobSearchFilters(filters);

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
