export const MAX_DISPLAYED_TOPICS = 3;

// Fetch one extra row per episode so the top-N slice stays deterministic when
// topic_rank ties occur (two topics sharing rank 1 would otherwise produce
// different chip sets across requests).
export const TOPICS_PER_EPISODE_LIMIT = MAX_DISPLAYED_TOPICS + 1;

export const CANONICAL_TOPICS_PER_EPISODE = MAX_DISPLAYED_TOPICS;
