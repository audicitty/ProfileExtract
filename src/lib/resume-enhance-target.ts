/**
 * The handoff from a job card to /enhance (idea.md §1.5, "Wire the enhancer to the
 * Job Matcher"). Only the target posting travels — never the resume, which is
 * re-provided on the enhancer page and, as with every other flow here, never stored.
 */
export const ENHANCE_TARGET_JOB_KEY = "profex:enhance-target-job";

export interface EnhanceTargetJob {
  title: string;
  company: string;
  description: string;
}

/** Reads the handoff, tolerating blocked storage and anything malformed. */
export function readEnhanceTargetJob(): EnhanceTargetJob | null {
  if (typeof window === "undefined") return null;

  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(ENHANCE_TARGET_JOB_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const description = typeof parsed?.description === "string" ? parsed.description : "";
    if (!description.trim()) return null;
    return {
      title: typeof parsed?.title === "string" ? parsed.title : "",
      company: typeof parsed?.company === "string" ? parsed.company : "",
      description,
    };
  } catch {
    return null;
  }
}

export function clearEnhanceTargetJob(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ENHANCE_TARGET_JOB_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
