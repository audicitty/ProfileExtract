import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { parseResume } from "@/lib/resume";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // 1. Session verification
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in to scan resumes." },
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

    const { text, fileBase64, mimeType } = body || {};

    if (!text && !fileBase64) {
      return NextResponse.json(
        { error: "Please provide resume text or upload a resume file." },
        { status: 400 }
      );
    }

    if (text && typeof text === "string" && text.trim().length < 50) {
      return NextResponse.json(
        { error: "Resume text is too brief (minimum 50 characters). Please provide a fuller resume or summary." },
        { status: 400 }
      );
    }

    // 3. Scan & parse resume with Gemini AI
    const parsedResume = await parseResume({
      text: typeof text === "string" ? text.trim() : undefined,
      fileBase64: typeof fileBase64 === "string" ? fileBase64 : undefined,
      mimeType: typeof mimeType === "string" ? mimeType : "application/pdf",
    });

    return NextResponse.json(
      {
        success: true,
        data: parsedResume,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to scan resume. Please ensure the document is clear and try again.";

    console.error("API /api/resume/scan error:", err);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
