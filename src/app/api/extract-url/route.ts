import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { extractProfileFromUrl } from "@/lib/brightdata";

export const maxDuration = 60; // Max duration to cover Bright Data scraping and polling

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

    const { url } = body || {};

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid profile URL." },
        { status: 400 }
      );
    }

    const trimmedUrl = url.trim();

    if (trimmedUrl.length < 5) {
      return NextResponse.json(
        { error: "Please enter a valid URL." },
        { status: 400 }
      );
    }

    // Basic URL validation
    try {
      const urlToTest =
        trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")
          ? trimmedUrl
          : `https://${trimmedUrl}`;
      new URL(urlToTest);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format. Please provide a valid web address (e.g. https://www.linkedin.com/in/username)." },
        { status: 400 }
      );
    }

    // 3. Bright Data Extraction
    const structuredProfile = await extractProfileFromUrl(trimmedUrl);

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
        : "Failed to extract profile from that URL. Please verify the URL is public and try again.";

    console.error("API /api/extract-url error:", err);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
