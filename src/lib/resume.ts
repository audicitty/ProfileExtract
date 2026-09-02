import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import { ParsedResume } from "./types";

const GEMINI_API_KEY =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";

const resumeResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    candidate_name: {
      type: SchemaType.STRING,
      description: "Full name of the candidate, or empty string",
    },
    email: {
      type: SchemaType.STRING,
      description: "Email address if present, or empty string",
    },
    phone: {
      type: SchemaType.STRING,
      description: "Phone number if present, or empty string",
    },
    location: {
      type: SchemaType.STRING,
      description: "Current city/country or location preference, or empty string",
    },
    target_roles: {
      type: SchemaType.ARRAY,
      description: "2 to 4 recommended job titles/roles matching the candidate's experience",
      items: { type: SchemaType.STRING },
    },
    extracted_skills: {
      type: SchemaType.ARRAY,
      description: "Comprehensive list of technical, programming, domain, and professional skills",
      items: { type: SchemaType.STRING },
    },
    years_of_experience: {
      type: SchemaType.NUMBER,
      description: "Estimated total years of professional experience as a number (e.g. 3.5, 5, 1)",
    },
    seniority_level: {
      type: SchemaType.STRING,
      description: "One of: Entry-level, Mid-level, Senior, Lead / Manager, Executive",
    },
    summary: {
      type: SchemaType.STRING,
      description: "Concise 2-3 sentence executive summary of the candidate's profile and top strengths",
    },
    suggested_search_keywords: {
      type: SchemaType.ARRAY,
      description: "3 to 5 targeted search terms for finding matching jobs on LinkedIn (e.g., 'Senior React Developer', 'Full Stack TypeScript Engineer')",
      items: { type: SchemaType.STRING },
    },
  },
  required: [
    "candidate_name",
    "target_roles",
    "extracted_skills",
    "years_of_experience",
    "seniority_level",
    "summary",
    "suggested_search_keywords",
  ],
};

const RESUME_SYSTEM_INSTRUCTION = `You are an elite career intelligence and resume analysis engine.
Your task is to analyze candidate resumes thoroughly and accurately extract key qualifications, skills, career trajectory, and job-matching criteria.

GUIDELINES:
1. Extract all technical languages, frameworks, cloud tools, databases, and core domain methodologies mentioned.
2. Accurately identify their most relevant target roles and seniority level based on work experience.
3. Formulate high-impact LinkedIn job search keywords that match their specific tech stack and role level.
4. Do not hallucinate fake skills. Stick to what is evidenced in the text.`;

export interface ParseResumeInput {
  text?: string;
  fileBase64?: string;
  mimeType?: string;
}

export async function parseResume(input: ParseResumeInput): Promise<ParsedResume> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please set GOOGLE_GENERATIVE_AI_API_KEY in your environment variables."
    );
  }

  const { text, fileBase64, mimeType = "application/pdf" } = input;

  if (!text && !fileBase64) {
    throw new Error("Please provide resume text or a valid resume file.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const candidateModels = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-latest"];

  let lastError: unknown = null;

  for (const modelName of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: RESUME_SYSTEM_INSTRUCTION,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: resumeResponseSchema,
          temperature: 0.1,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [];

      if (fileBase64) {
        parts.push({
          inlineData: {
            mimeType: mimeType.includes("pdf") ? "application/pdf" : mimeType,
            data: fileBase64,
          },
        });
        parts.push({
          text: "Carefully analyze this uploaded resume document and extract all fields according to the schema.",
        });
      } else if (text) {
        parts.push({
          text: `Carefully analyze the following candidate resume text and extract all fields according to the schema:\n\n--- BEGIN RESUME TEXT ---\n${text}\n--- END RESUME TEXT ---`,
        });
      }

      const result = await model.generateContent(
        {
          contents: [{ role: "user", parts }],
        },
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const responseText = result.response.text();
      if (!responseText) {
        throw new Error("Empty response from resume parsing model.");
      }

      const parsed = JSON.parse(responseText);

      const validSeniority = [
        "Entry-level",
        "Mid-level",
        "Senior",
        "Lead / Manager",
        "Executive",
      ];
      const seniority = validSeniority.includes(parsed.seniority_level)
        ? (parsed.seniority_level as ParsedResume["seniority_level"])
        : "Mid-level";

      const normalized: ParsedResume = {
        candidate_name: String(parsed.candidate_name || "").trim(),
        email: parsed.email ? String(parsed.email).trim() : undefined,
        phone: parsed.phone ? String(parsed.phone).trim() : undefined,
        location: parsed.location ? String(parsed.location).trim() : undefined,
        target_roles: Array.isArray(parsed.target_roles)
          ? parsed.target_roles.map((r: unknown) => String(r).trim()).filter(Boolean)
          : ["Software Professional"],
        extracted_skills: Array.isArray(parsed.extracted_skills)
          ? parsed.extracted_skills.map((s: unknown) => String(s).trim()).filter(Boolean)
          : [],
        years_of_experience: typeof parsed.years_of_experience === "number" ? parsed.years_of_experience : 0,
        seniority_level: seniority,
        summary: String(parsed.summary || "").trim(),
        suggested_search_keywords: Array.isArray(parsed.suggested_search_keywords)
          ? parsed.suggested_search_keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
          : [],
      };

      return normalized;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      lastError = err;
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (
        errorMessage.includes("404") ||
        errorMessage.includes("not found") ||
        errorMessage.includes("unsupported")
      ) {
        continue;
      }

      console.error(`Error parsing resume with model ${modelName}:`, err);
      break;
    }
  }

  throw (
    lastError ||
    new Error("Unable to parse the resume. Please check the document format and try again.")
  );
}
