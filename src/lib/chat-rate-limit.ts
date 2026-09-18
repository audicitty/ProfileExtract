import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { chatUsage } from "../db/schema";

/**
 * Per-user daily message cap (idea.md §2.3).
 *
 * Chat is the first endpoint here that a client can call in a loop, so the cap is not
 * optional: at 10–100 users one runaway tab can spend the whole day's Gemini quota.
 * 25/day is comfortably above a real job-hunting session (~15–25 turns) and bounds the
 * worst case to 25 × ~20k input tokens per user.
 */
export const CHAT_DAILY_MESSAGE_CAP = (() => {
  const raw = Number(process.env.CHAT_DAILY_MESSAGE_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 25;
})();

/** UTC calendar day key, "YYYY-MM-DD". UTC so the reset point never moves with DST. */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The instant the cap resets: the next UTC midnight after `now`. */
export function nextUtcMidnight(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

/** Whole seconds until the cap resets, for the `Retry-After` header. */
export function secondsUntilReset(now: Date = new Date()): number {
  return Math.max(1, Math.ceil((nextUtcMidnight(now).getTime() - now.getTime()) / 1000));
}

export interface ChatQuota {
  allowed: boolean;
  /** Messages counted for this user today, including the one just consumed. */
  used: number;
  cap: number;
  /** ISO timestamp of the next UTC midnight. */
  resetAt: string;
  retryAfterSeconds: number;
}

/**
 * Counts one chat message against the user's daily allowance and says whether it may
 * proceed. Called once per request, before the model call.
 *
 * The upsert is the whole mechanism — a single round trip, atomic under concurrency,
 * and correct across instances. The counter keeps climbing past the cap so the rows
 * stay an honest record of how hard someone hit the endpoint.
 */
export async function consumeChatMessage(
  userId: string,
  now: Date = new Date()
): Promise<ChatQuota> {
  const rows = await db
    .insert(chatUsage)
    .values({ userId, usageDate: utcDayKey(now), messageCount: 1 })
    .onConflictDoUpdate({
      target: [chatUsage.userId, chatUsage.usageDate],
      set: {
        messageCount: sql`${chatUsage.messageCount} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ messageCount: chatUsage.messageCount });

  const used = rows[0]?.messageCount ?? 1;

  return {
    allowed: used <= CHAT_DAILY_MESSAGE_CAP,
    used,
    cap: CHAT_DAILY_MESSAGE_CAP,
    resetAt: nextUtcMidnight(now).toISOString(),
    retryAfterSeconds: secondsUntilReset(now),
  };
}

/**
 * Gives a message back when the turn produced nothing — an upstream 503 should not
 * cost the user one of their 25. Floored at zero so a double refund cannot go negative.
 */
export async function refundChatMessage(
  userId: string,
  now: Date = new Date()
): Promise<void> {
  await db
    .update(chatUsage)
    .set({ messageCount: sql`GREATEST(${chatUsage.messageCount} - 1, 0)`, updatedAt: new Date() })
    .where(and(eq(chatUsage.userId, userId), eq(chatUsage.usageDate, utcDayKey(now))));
}
