import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { extractProfileData } from "@/lib/gemini";

export const maxDuration = 60; // Max duration to comfortably cover Gemini latency on large inputs

export async function POST(req: NextRequest) {
  try {
    // 1. Server-side session verification
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in to extract profile data." },
        { status: 401 }
      );
    }

    // 2. Server-side request payload validation
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload in request." },
        { status: 400 }
      );
    }

    const { rawText } = body || {};

    if (!rawText || typeof rawText !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid profile text." },
        { status: 400 }
      );
    }

    const trimmedText = rawText.trim();

    if (trimmedText.length < 100) {
      return NextResponse.json(
        {
          error:
            "Input text is too short (minimum 100 characters). Please paste the full visible profile text from LinkedIn.",
        },
        { status: 400 }
      );
    }

    // Maximum safe ceiling to avoid extreme payload attacks (e.g. 500,000 characters)
    if (trimmedText.length > 500000) {
      return NextResponse.json(
        {
          error: "Input text is too large. Please paste only the relevant profile content.",
        },
        { status: 400 }
      );
    }

    // 3. AI structuring with Gemini (stateless - zero DB write)
    const structuredProfile = await extractProfileData(trimmedText);

    return NextResponse.json(
      {
        success: true,
        data: structuredProfile,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Couldn't process that text — please check it was copied correctly and try again.";

    console.error("API /api/extract error:", err);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
