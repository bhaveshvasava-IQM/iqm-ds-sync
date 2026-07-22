// search-design-system — full-text search across tokens + components.
import { searchAll } from "../lib.js";

export const description =
  "Full-text search across the design system. Optionally filter by type " +
  "(token | component | all). Returns ranked results (tokens before components on ties), " +
  "each with a relevance score and which field matched (name/path vs description vs value).";

export function run({ query, type = "all", limit = 20 } = {}) {
  const results = searchAll(query, type).slice(0, Math.max(0, limit));
  return {
    query: String(query || ""),
    type,
    count: results.length,
    results: results.map((r) => ({
      type: r.type,
      title: r.title,
      subtitle: r.subtitle || null,
      score: r.score,
      matchedIn: r.matchedIn,
      ...(r.type === "token" ? { value: r.value } : { status: r.status, componentId: r.componentId }),
    })),
  };
}
