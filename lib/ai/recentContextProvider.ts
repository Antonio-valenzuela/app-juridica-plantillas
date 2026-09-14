import type { RecentContextInput, RecentContextResult } from "./tasks";

export async function searchRecentContext(input: RecentContextInput): Promise<RecentContextResult> {
  void input;

  if (process.env.AI_ENABLE_EXTERNAL_CONTEXT !== "true") {
    return { results: [], provider: "none" };
  }

  return { results: [], provider: "none" };
}
