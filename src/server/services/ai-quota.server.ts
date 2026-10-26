import { getDb } from "@/server/db/client.server";
import type { SessionUser } from "@/shared/types";

import { logActivity } from "./activity-log.server";

/**
 * Per-account and app-wide AI quota, counted from the activity log.
 *
 * There is no counter table to migrate: every successful AI call writes one
 * `ai.request` row, and the quota is a count over the last 24 hours. That keeps
 * the limit shared across Workers instances and cold starts — an in-memory
 * counter would reset constantly and could be bypassed by hitting a fresh
 * isolate.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;
/** How many AI calls one account may make in a rolling 24 hours. */
const PER_USER_LIMIT = 100;
/** Ceiling for the whole app, however many accounts are active. */
const GLOBAL_LIMIT = 1000;

async function countRequests(since: string, actorId?: string): Promise<number> {
  let query = getDb()
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "ai.request")
    .gte("created_at", since);

  if (actorId) query = query.eq("actor_id", actorId);

  const { count, error } = await query;
  if (error) {
    // Fail open: a broken count must not take the AI features offline.
    console.error(`[ai-quota] ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

/** Throws when the caller has used up today's AI allowance. */
export async function assertAiQuota(user: SessionUser): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const [mine, all] = await Promise.all([countRequests(since, user.id), countRequests(since)]);

  if (mine >= PER_USER_LIMIT) {
    throw new Error("You've reached today's AI limit. Please try again tomorrow.");
  }
  if (all >= GLOBAL_LIMIT) {
    throw new Error("The AI helper is at capacity right now. Please try again later.");
  }
}

/** Record one successful AI call against the caller's quota. */
export async function recordAiRequest(user: SessionUser, feature: string): Promise<void> {
  await logActivity({
    action: "ai.request",
    actorId: user.id,
    actorName: user.label,
    actorNumber: user.idNumber,
    target: feature,
  });
}
