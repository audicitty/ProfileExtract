import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { GoogleGenAI, type Content, type GenerateContentResponse } from "@google/genai";
import { auth } from "@/lib/auth";
import {
  CHAT_SYSTEM_INSTRUCTION,
  buildChatContents,
  normaliseHistory,
} from "@/lib/chat-context";
import { CHAT_TOOL_DECLARATIONS, runChatTool } from "@/lib/chat-tools";
import { consumeChatMessage, refundChatMessage } from "@/lib/chat-rate-limit";
import type { JobListing, ParsedResume } from "@/lib/types";

/**
 * Node, not edge. Better Auth's session lookup and the rate-limit counter both go
 * through the `pg` pool over a TCP socket, which the edge runtime has no sockets for,
 * and the job-search tool reuses the same Node-only LinkedIn client as /api/jobs/search.
 * Streaming works identically on Node here, so edge would buy nothing and cost the DB.
 */
export const runtime = "nodejs";

/**
 * A plain answer returns in a few seconds; a turn that calls `search_jobs` spends up to
 * ~25s inside LinkedIn's description budget and then needs a second model turn. 120s
 * leaves room for that. Vercel's Hobby tier clamps this to 60s, which is why the tool
 * loop below stops starting new tools at `TOOL_DEADLINE_MS`.
 */
export const maxDuration = 120;

/**
 * Model fallback chain, same shape as `parseResume` and `reviewResumeContent` — the
 * flash model returns 503 "high demand" often enough that a chat without a retry looks
 * broken to the user.
 */
const CHAT_MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];

/** Upstream conditions worth retrying: overload and throttling, never a bad request. */
const TRANSIENT_ERROR =
  /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|deadline/i;

const RETRY_DELAY_MS = 700;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A message a user can act on. The raw SDK payload goes to the server log, not the UI. */
function friendlyModelError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (/RESOURCE_EXHAUSTED|\b429\b|quota/i.test(raw)) {
    return "The Gemini quota for this key is exhausted. Try again later.";
  }
  if (TRANSIENT_ERROR.test(raw)) {
    return "Gemini is busy right now and did not answer. Give it a few seconds and ask again.";
  }
  if (/API key/i.test(raw)) {
    return "The Gemini API key was rejected. Check GOOGLE_GENERATIVE_AI_API_KEY.";
  }
  return "The assistant failed to answer. Please try again.";
}

/** How many model -> tool -> model rounds one user message may drive. */
const MAX_TOOL_ROUNDS = 3;

/** No new tool call starts after this point in the request; the model answers with what it has. */
const TOOL_DEADLINE_MS = 45_000;

interface UsageTotals {
  prompt: number;
  cached: number;
  output: number;
}

export async function POST(req: NextRequest) {
  // 1. Session verification — the same guard as every other route here.
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || !session.user) {
    return NextResponse.json(
      { error: "Unauthorized. Please log in to use the career assistant." },
      { status: 401 }
    );
  }

  // 2. Request payload validation
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload in request." }, { status: 400 });
  }

  const history = normaliseHistory(body?.messages);

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "Send at least one message, ending with the user's turn." },
      { status: 400 }
    );
  }

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY." },
      { status: 500 }
    );
  }

  // 3. Rate limit (idea.md §2.3). Counted before the model call, never after.
  let quota;
  try {
    quota = await consumeChatMessage(session.user.id);
  } catch (err) {
    console.error("API /api/chat rate-limit error:", err);
    return NextResponse.json(
      {
        error:
          "Chat is unavailable because the usage counter could not be read. If this is a fresh database, run `npm run db:push` to create the chat_usage table.",
      },
      { status: 503 }
    );
  }

  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: `You have used your ${quota.cap} chat messages for today. The limit resets at ${quota.resetAt}.`,
        quota,
      },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } }
    );
  }

  const resume = (body?.resume ?? null) as ParsedResume | null;
  const jobs = Array.isArray(body?.jobs) ? (body.jobs as JobListing[]) : [];

  const ai = new GoogleGenAI({ apiKey });
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      const usage: UsageTotals = { prompt: 0, cached: 0, output: 0 };
      let rounds = 0;

      try {
        send({ t: "meta", quota: { used: quota.used, cap: quota.cap, resetAt: quota.resetAt } });

        const contents = buildChatContents(resume, jobs, history) as Content[];

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          rounds = round + 1;

          /*
           * On the last allowed round, and past the deadline, the tools are simply not
           * offered, so the turn has to end in an answer.
           *
           * Do NOT express this as toolConfig.functionCallingConfig.mode = NONE while the
           * declarations stay: the API then aborts the turn with finishReason
           * UNEXPECTED_TOOL_CALL the moment the model wants a tool, and the user gets an
           * empty reply. Measured, not assumed.
           */
          const allowCalls = round < MAX_TOOL_ROUNDS && Date.now() - startedAt <= TOOL_DEADLINE_MS;

          /** Runs one model turn, streaming its text out as it arrives. */
          const runTurn = async (withTools: boolean) => {
            const config = {
              systemInstruction: CHAT_SYSTEM_INSTRUCTION,
              temperature: 0.4,
              abortSignal: req.signal,
              ...(withTools ? { tools: [{ functionDeclarations: CHAT_TOOL_DECLARATIONS }] } : {}),
            };

            /*
             * Retry before the stream opens, never during it: once a chunk has been sent
             * the client has partial text on screen and a retry would duplicate it.
             */
            let result;
            let lastError: unknown = null;

            outer: for (const model of CHAT_MODELS) {
              for (let attempt = 0; attempt < 2; attempt++) {
                try {
                  result = await ai.models.generateContentStream({ model, contents, config });
                  break outer;
                } catch (err) {
                  lastError = err;
                  const raw = err instanceof Error ? err.message : String(err);
                  console.error(`API /api/chat model ${model} attempt ${attempt + 1} failed:`, raw);
                  if (!TRANSIENT_ERROR.test(raw)) break;
                  await sleep(RETRY_DELAY_MS * (attempt + 1));
                }
              }
            }

            if (!result) throw lastError ?? new Error("No response from the model.");

            let text = "";
            const calls: { name?: string; args?: Record<string, unknown> }[] = [];
            let lastUsage: GenerateContentResponse["usageMetadata"];
            let finishReason = "";

            for await (const chunk of result) {
              /*
               * Read the text parts directly rather than through `chunk.text`, which logs
               * a warning on every chunk that also carries a functionCall — i.e. on every
               * tool call this feature makes.
               */
              const candidate = chunk.candidates?.[0];
              const chunkText = (candidate?.content?.parts ?? [])
                .filter((part) => typeof part.text === "string" && !part.thought)
                .map((part) => part.text)
                .join("");

              if (chunkText) {
                text += chunkText;
                send({ t: "text", v: chunkText });
              }

              const functionCalls = chunk.functionCalls;
              if (functionCalls?.length) calls.push(...functionCalls);

              if (candidate?.finishReason) finishReason = String(candidate.finishReason);
              if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;
            }

            // Usage arrives cumulative per turn, so sum the turns, not the chunks.
            usage.prompt += lastUsage?.promptTokenCount ?? 0;
            usage.cached += lastUsage?.cachedContentTokenCount ?? 0;
            usage.output += lastUsage?.candidatesTokenCount ?? 0;

            return { text, calls, finishReason };
          };

          let turn = await runTurn(allowCalls);

          /*
           * Gemini occasionally ends a turn with neither text nor a call — an empty
           * `content` with finishReason STOP. Asking again without the tools produces a
           * plain answer, which beats showing the user an empty reply.
           */
          if (!turn.text && turn.calls.length === 0 && allowCalls) {
            console.warn(
              `[Chat] empty turn (finishReason=${turn.finishReason || "none"}); retrying without tools`
            );
            turn = await runTurn(false);
          }

          const turnText = turn.text;
          const calls = turn.calls;

          if (calls.length === 0) break;

          contents.push({
            role: "model",
            parts: [
              ...(turnText ? [{ text: turnText }] : []),
              ...calls.map((call) => ({
                functionCall: { name: call.name, args: call.args ?? {} },
              })),
            ],
          });

          const responseParts = [];

          for (const call of calls) {
            const name = call.name || "unknown";
            send({ t: "tool", name, status: "running" });

            let outcome;
            try {
              outcome = await runChatTool(name, call.args ?? {}, { resume, jobs });
            } catch (err) {
              console.error(`API /api/chat tool "${name}" failed:`, err);
              outcome = {
                label: `${name} failed`,
                result: {
                  error: err instanceof Error ? err.message : "The tool failed to run.",
                },
              };
            }

            send({ t: "tool", name, status: "done", label: outcome.label });

            if (outcome.event?.type === "jobs") {
              // The user's results are replaced, so the page updates with the answer.
              jobs.splice(0, jobs.length, ...outcome.event.jobs);
              send({ t: "jobs", jobs: outcome.event.jobs });
            } else if (outcome.event?.type === "enhancer") {
              send({ t: "enhancer", job: outcome.event.job });
            }

            responseParts.push({
              functionResponse: { name, response: outcome.result },
            });
          }

          contents.push({ role: "user", parts: responseParts });
        }

        const cachedPct = usage.prompt > 0 ? Math.round((usage.cached / usage.prompt) * 100) : 0;

        // idea.md §2.1 — implicit caching is the reason this feature skips RAG, so the
        // hit rate is logged on every turn rather than taken on trust.
        console.log(
          `[Chat] user=${session.user.id} rounds=${rounds} prompt=${usage.prompt} cached=${usage.cached} (${cachedPct}%) output=${usage.output} ms=${Date.now() - startedAt}`
        );

        send({
          t: "usage",
          prompt: usage.prompt,
          cached: usage.cached,
          output: usage.output,
          cachedPct,
          ms: Date.now() - startedAt,
        });
        send({ t: "done" });
      } catch (err) {
        console.error("API /api/chat stream error:", err);

        // A turn that produced nothing did not earn its slot against the daily cap.
        if (usage.output === 0) {
          await refundChatMessage(session.user.id).catch((refundErr) =>
            console.error("API /api/chat refund failed:", refundErr)
          );
        }

        send({ t: "error", message: friendlyModelError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Nginx and friends buffer a streamed body by default, which reads as a hang.
      "X-Accel-Buffering": "no",
    },
  });
}
