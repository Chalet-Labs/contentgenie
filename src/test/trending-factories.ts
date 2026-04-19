import { slugify } from "@/lib/utils";
import type { TrendingTopic } from "@/db/schema";

/**
 * Build a `TrendingTopic` for tests. `slug` defaults to `slugify(name)` so
 * tests never drift from the production slug helper. Pass `overrides` to
 * customize any field, including forcing an empty-string slug to exercise
 * the defensive fallback path.
 */
export function makeTopic(overrides: Partial<TrendingTopic> = {}): TrendingTopic {
  const name = overrides.name ?? "Test Topic";
  return {
    name,
    description: "A test topic description",
    episodeCount: 5,
    episodeIds: [1, 2, 3, 4, 5],
    slug: slugify(name),
    ...overrides,
  };
}
