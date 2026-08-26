import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import { ProfileData } from "./types";

const GEMINI_API_KEY =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";

const profileResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    first_name: {
      type: SchemaType.STRING,
      description: "First name of the profile person, or empty string if not found",
    },
    last_name: {
      type: SchemaType.STRING,
      description: "Last name of the profile person, or empty string if not found",
    },
    headline: {
      type: SchemaType.STRING,
      description: "Professional headline or tagline under the name, or empty string",
    },
    current_company: {
      type: SchemaType.STRING,
      description: "Name of the current employer/company, or empty string",
    },
    current_title: {
      type: SchemaType.STRING,
      description: "Current job title/role, or empty string",
    },
    location: {
      type: SchemaType.STRING,
      description: "Geographic location / city / country, or empty string",
    },
    about: {
      type: SchemaType.STRING,
      description: "The About / Summary section text, or empty string",
    },
    education: {
      type: SchemaType.ARRAY,
      description: "List of educational institutions and degrees",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          school: { type: SchemaType.STRING, description: "School / University name" },
          degree: { type: SchemaType.STRING, description: "Degree / Field of study" },
          years: { type: SchemaType.STRING, description: "Years attended (e.g., 2018 - 2022)" },
        },
        required: ["school", "degree", "years"],
      },
    },
    experience: {
      type: SchemaType.ARRAY,
      description: "List of work experience positions",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          company: { type: SchemaType.STRING, description: "Company name" },
          title: { type: SchemaType.STRING, description: "Job title / role" },
          duration: { type: SchemaType.STRING, description: "Employment duration (e.g., Jan 2021 - Present)" },
          description: { type: SchemaType.STRING, description: "Role description / bullet points" },
        },
        required: ["company", "title", "duration", "description"],
      },
    },
    projects: {
      type: SchemaType.ARRAY,
      description: "List of featured projects",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: "Project name" },
          description: { type: SchemaType.STRING, description: "Project description / details" },
        },
        required: ["name", "description"],
      },
    },
    certifications: {
      type: SchemaType.ARRAY,
      description: "List of licenses and certifications",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING, description: "Certification name" },
          issuer: { type: SchemaType.STRING, description: "Issuing organization" },
          date: { type: SchemaType.STRING, description: "Issue date or expiration" },
        },
        required: ["name", "issuer", "date"],
      },
    },
    skills: {
      type: SchemaType.ARRAY,
      description: "List of technical and professional skills mentioned",
      items: { type: SchemaType.STRING },
    },
  },
  required: [
    "first_name",
    "last_name",
    "headline",
    "current_company",
    "current_title",
    "location",
    "about",
    "education",
    "experience",
    "projects",
    "certifications",
    "skills",
  ],
};

const SYSTEM_INSTRUCTION = `You are a high-precision LinkedIn profile data structuring engine.
Your sole job is to extract and normalize the profile information from the raw copied text into the schema.

STRICT ACCURACY RULES:
1. Extract only facts directly and explicitly stated in the input text.
2. If any field or subfield cannot be confidently identified in the text, leave it as an empty string ("") or empty array ([]).
3. Under no circumstances should you invent, extrapolate, or hallucinate names, companies, roles, dates, degrees, or skills.
4. Accuracy is strictly prioritized over completeness.
5. In experience and education, preserve order and accurately capture the duration and descriptions.`;

export async function extractProfileData(rawText: string): Promise<ProfileData> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please set GOOGLE_GENERATIVE_AI_API_KEY in your environment variables."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // Model list to try in order of preference
  const candidateModels = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-latest"];

  let lastError: unknown = null;

  for (const modelName of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 45000); // 45-second timeout to comfortably allow thorough structuring of long text

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: profileResponseSchema,
          temperature: 0.1, // low temperature for deterministic and accurate extraction
        },
      });

      const prompt = `Extract and normalize the structured LinkedIn profile from the following raw text:\n\n--- BEGIN RAW PROFILE TEXT ---\n${rawText}\n--- END RAW PROFILE TEXT ---`;

      const result = await model.generateContent(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        },
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const responseText = result.response.text();
      if (!responseText) {
        throw new Error("Empty response returned by structuring engine.");
      }

      const parsed = JSON.parse(responseText) as ProfileData;

      // Ensure all fields adhere to the schema defaults
      const normalized: ProfileData = {
        first_name: typeof parsed.first_name === "string" ? parsed.first_name.trim() : "",
        last_name: typeof parsed.last_name === "string" ? parsed.last_name.trim() : "",
        headline: typeof parsed.headline === "string" ? parsed.headline.trim() : "",
        current_company:
          typeof parsed.current_company === "string" ? parsed.current_company.trim() : "",
        current_title: typeof parsed.current_title === "string" ? parsed.current_title.trim() : "",
        location: typeof parsed.location === "string" ? parsed.location.trim() : "",
        about: typeof parsed.about === "string" ? parsed.about.trim() : "",
        education: Array.isArray(parsed.education)
          ? parsed.education.map((e) => ({
              school: String(e.school || "").trim(),
              degree: String(e.degree || "").trim(),
              years: String(e.years || "").trim(),
            }))
          : [],
        experience: Array.isArray(parsed.experience)
          ? parsed.experience.map((e) => ({
              company: String(e.company || "").trim(),
              title: String(e.title || "").trim(),
              duration: String(e.duration || "").trim(),
              description: String(e.description || "").trim(),
            }))
          : [],
        projects: Array.isArray(parsed.projects)
          ? parsed.projects.map((p) => ({
              name: String(p.name || "").trim(),
              description: String(p.description || "").trim(),
            }))
          : [],
        certifications: Array.isArray(parsed.certifications)
          ? parsed.certifications.map((c) => ({
              name: String(c.name || "").trim(),
              issuer: String(c.issuer || "").trim(),
              date: String(c.date || "").trim(),
            }))
          : [],
        skills: Array.isArray(parsed.skills)
          ? parsed.skills.map((s) => String(s || "").trim()).filter(Boolean)
          : [],
      };

      return normalized;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      lastError = err;

      const errorMessage = err instanceof Error ? err.message : String(err);

      // If aborted due to timeout
      if (
        (err as { name?: string })?.name === "AbortError" ||
        errorMessage.toLowerCase().includes("aborted")
      ) {
        throw new Error("Extraction request timed out. Please try again or check your network connection.");
      }

      // If the model is not found or unsupported in the tier, try the next model
      if (
        errorMessage.includes("404") ||
        errorMessage.includes("not found") ||
        errorMessage.includes("unsupported")
      ) {
        console.warn(`Model ${modelName} not available, attempting next candidate...`);
        continue;
      }

      // If invalid JSON or API key error
      if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
        throw new Error(
          "Invalid Gemini API key. Please check your GOOGLE_GENERATIVE_AI_API_KEY environment variable."
        );
      }

      if (errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        throw new Error("Gemini API rate limit or quota reached. Please wait a moment and try again.");
      }

      // For parse errors or other issues
      throw new Error(
        "Couldn't process that text — please check it was copied correctly and try again."
      );
    }
  }

  // If all candidate models failed
  console.error("All Gemini candidate models failed:", lastError);
  throw new Error(
    "Couldn't process that text — please check it was copied correctly and try again."
  );
}
