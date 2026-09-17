import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { extractResumeDocument } from "@/lib/pdf-structure";
import { auditResumeStructure } from "@/lib/resume-ats";
import { reviewResumeContent, toAtsSafeText } from "@/lib/resume-enhance";
import type { ResumeAudit, ResumeEnhanceResult } from "@/lib/types";

export const maxDuration = 60;

/** Matches the client-side upload cap in ResumeIntake (10MB of PDF, base64-inflated). */
const MAX_FILE_BASE64_CHARS = 14_000_000;

export async function POST(req: NextRequest) {
  try {
    // 1. Session verification
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in to enhance resumes." },
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

    const { text, fileBase64, mimeType, targetJobDescription } = body || {};

    if (!text && !fileBase64) {
      return NextResponse.json(
        { error: "Please provide resume text or upload a resume file." },
        { status: 400 }
      );
    }

    if (text && typeof text === "string" && text.trim().length < 50) {
      return NextResponse.json(
        { error: "Resume text is too brief (minimum 50 characters). Please provide the full resume." },
        { status: 400 }
      );
    }

    if (fileBase64 && typeof fileBase64 === "string" && fileBase64.length > MAX_FILE_BASE64_CHARS) {
      return NextResponse.json(
        { error: "That file is too large. Please upload a resume PDF under 10MB." },
        { status: 400 }
      );
    }

    if (fileBase64 && typeof mimeType === "string" && mimeType && !mimeType.includes("pdf")) {
      return NextResponse.json(
        { error: "Only PDF resumes can be analysed for structure. Please upload a PDF or paste the text." },
        { status: 400 }
      );
    }

    // 3. Structural layer — only a PDF carries the geometry the bench-derived checks read.
    let audit: ResumeAudit | null = null;
    let auditSkippedReason: ResumeEnhanceResult["audit_skipped_reason"];
    let resumeText = typeof text === "string" ? text.trim() : "";

    if (typeof fileBase64 === "string" && fileBase64) {
      try {
        const bytes = Uint8Array.from(Buffer.from(fileBase64, "base64"));
        const doc = await extractResumeDocument(bytes);
        audit = auditResumeStructure(doc);
        if (!resumeText) resumeText = doc.text;
      } catch (err) {
        console.error("API /api/resume/enhance PDF read error:", err);
        auditSkippedReason = "pdf_unreadable";
      }
    } else {
      // Pasted text has no layout to measure. Reporting that is honest; scoring it is not.
      auditSkippedReason = "text_input";
    }

    if (!resumeText || resumeText.trim().length < 50) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No readable text was found in that resume. If it is a scanned image, re-export it as a text PDF or paste the text instead.",
        },
        { status: 422 }
      );
    }

    // 4. Content layer — judgement only, and it never returns a score.
    const content = await reviewResumeContent({
      resumeText,
      targetJobDescription:
        typeof targetJobDescription === "string" ? targetJobDescription : undefined,
    });

    // The structural audit carries the content layer's output for the UI, per idea.md §1.4.
    if (audit) {
      audit.bullet_rewrites = content.bullet_rewrites;
      audit.keyword_gaps = content.keyword_gaps;
      audit.section_analysis = content.section_analysis;
    }

    const data: ResumeEnhanceResult = {
      audit,
      ...(auditSkippedReason ? { audit_skipped_reason: auditSkippedReason } : {}),
      content,
      ats_safe_text: toAtsSafeText(resumeText),
    };

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to enhance resume. Please try again.";

    console.error("API /api/resume/enhance error:", err);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
