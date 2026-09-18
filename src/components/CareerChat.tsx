"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Send,
  Sparkles,
  Wrench,
  AlertCircle,
  Wand2,
  Loader2,
} from "lucide-react";
import type { JobListing, ParsedResume } from "@/lib/types";
import { ENHANCE_TARGET_JOB_KEY } from "@/lib/resume-enhance-target";

/**
 * The career chat (idea.md §2).
 *
 * The resume and the matched jobs are already in this page's React state, so they are
 * posted with every turn and the server keeps nothing: no database, no embeddings, no
 * stored transcript. Refreshing the page ends the conversation, which is the intent.
 */

interface UsageLine {
  prompt: number;
  cached: number;
  cachedPct: number;
  ms: number;
}

interface UiMessage {
  role: "user" | "assistant";
  content: string;
  /** Labels of tools this turn ran, shown as chips above the reply. */
  tools?: string[];
  usage?: UsageLine;
}

interface EnhancerHandoff {
  title: string;
  company: string;
}

interface CareerChatProps {
  resume: ParsedResume | null;
  jobs: JobListing[];
  /** Called when the `search_jobs` tool replaces the user's results. */
  onJobsReplaced?: (jobs: JobListing[]) => void;
}

/**
 * Renders the light markdown the model actually emits — `**bold**` around job titles,
 * mostly. Without this the asterisks show up verbatim and the reply reads as broken.
 * Deliberately not a markdown parser: no dependency, and nothing here renders HTML.
 */
function renderInline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={index} className="font-semibold text-slate-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

const STARTERS = [
  "Which three of these jobs fit me best, and why?",
  "What skill is missing most often across these postings?",
  "Re-run the search for remote backend roles posted this week",
  "How would my score change if I learned Kubernetes?",
];

export function CareerChat({ resume, jobs, onJobsReplaced }: CareerChatProps) {
  const router = useRouter();

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; cap: number } | null>(null);
  const [handoff, setHandoff] = useState<EnhancerHandoff | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const sendMessage = async (text: string) => {
    const question = text.trim();
    if (!question || streaming) return;

    setError(null);
    setHandoff(null);
    setInput("");

    const history = [...messages, { role: "user" as const, content: question }];
    setMessages([...history, { role: "assistant", content: "", tools: [] }]);
    setStreaming(true);

    /** Updates the assistant turn being streamed, which is always the last message. */
    const patchLast = (patch: (message: UiMessage) => UiMessage) => {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = patch(next[next.length - 1]);
        return next;
      });
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          resume,
          jobs,
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error || "The assistant is unavailable right now.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // NDJSON: one JSON event per line, so a partial line is held until it completes.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          switch (event.t) {
            case "meta":
              setQuota(event.quota as { used: number; cap: number });
              break;
            case "text":
              patchLast((message) => ({ ...message, content: message.content + String(event.v) }));
              break;
            case "tool":
              if (event.status === "done") {
                patchLast((message) => ({
                  ...message,
                  tools: [...(message.tools || []), String(event.label)],
                }));
              } else {
                patchLast((message) => ({
                  ...message,
                  tools: [...(message.tools || []), `Running ${String(event.name)}…`],
                }));
              }
              break;
            case "jobs":
              onJobsReplaced?.(event.jobs as JobListing[]);
              break;
            case "enhancer": {
              const job = event.job as { title: string; company: string; description: string };
              try {
                sessionStorage.setItem(
                  ENHANCE_TARGET_JOB_KEY,
                  JSON.stringify({
                    title: job.title,
                    company: job.company,
                    description: job.description || "",
                  })
                );
              } catch {
                // Private mode: the enhancer still works, just without the target job.
              }
              setHandoff({ title: job.title, company: job.company });
              break;
            }
            case "usage":
              patchLast((message) => ({
                ...message,
                usage: {
                  prompt: Number(event.prompt) || 0,
                  cached: Number(event.cached) || 0,
                  cachedPct: Number(event.cachedPct) || 0,
                  ms: Number(event.ms) || 0,
                },
              }));
              break;
            case "error":
              setError(String(event.message));
              break;
            default:
              break;
          }
        }
      }

      // A turn that produced nothing readable should say so rather than sit blank.
      patchLast((message) =>
        message.content.trim()
          ? message
          : { ...message, content: "I could not produce an answer for that. Try rephrasing it." }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "The assistant failed to answer.";
      setError(message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  const openEnhancer = () => router.push("/enhance");

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f4c81] text-white">
            <MessageSquare className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Ask about your matches</h2>
            <p className="text-xs text-slate-500">
              {jobs.length > 0
                ? `${jobs.length} jobs and your resume are in context. It can also re-run the search for you.`
                : "Your resume is in context. Ask it to run a search with different filters."}
            </p>
          </div>
        </div>
        {quota && (
          <span className="self-start rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {quota.used} / {quota.cap} messages today
          </span>
        )}
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="max-h-[480px] space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              No chat history is stored — this conversation lives in this tab only.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  onClick={() => sendMessage(starter)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-[#0f4c81] hover:text-[#0f4c81]"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div className={message.role === "user" ? "max-w-[85%]" : "max-w-[92%] space-y-2"}>
              {message.role === "assistant" && (message.tools?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {message.tools?.map((tool, toolIndex) => (
                    <span
                      key={toolIndex}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800"
                    >
                      <Wrench className="h-3 w-3" />
                      {tool}
                    </span>
                  ))}
                </div>
              )}

              <div
                className={
                  message.role === "user"
                    ? "rounded-2xl rounded-br-sm bg-[#0f4c81] px-4 py-2.5 text-sm text-white"
                    : "whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-50 px-4 py-2.5 text-sm leading-relaxed text-slate-800"
                }
              >
                {message.content ? (
                  message.role === "assistant" ? renderInline(message.content) : message.content
                ) : (
                  <span className="inline-flex items-center gap-2 text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking…
                  </span>
                )}
              </div>

              {/* idea.md §2.1 — the cache hit rate is the reason this feature skips RAG. */}
              {message.usage && (
                <p className="px-1 text-[11px] text-slate-400">
                  {message.usage.prompt.toLocaleString()} prompt tokens ·{" "}
                  {message.usage.cached.toLocaleString()} cached ({message.usage.cachedPct}%) ·{" "}
                  {(message.usage.ms / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          </div>
        ))}

        {handoff && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
            <p className="text-xs text-violet-900">
              <span className="font-semibold">{handoff.title}</span> at {handoff.company} is loaded
              into the Resume Enhancer.
            </p>
            <button
              onClick={openEnhancer}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Open enhancer
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="flex items-center gap-2 border-t border-slate-200 px-5 py-3"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          placeholder="Ask about these jobs, your gaps, or run a new search…"
          maxLength={4000}
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#0f4c81] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#0d3f6b] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {streaming ? "Answering" : "Send"}
        </button>
      </form>
    </div>
  );
}
