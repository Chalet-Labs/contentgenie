/** Minimum derived episode count for digest generation (ADR-051). */
export const MIN_DERIVED_COUNT_FOR_DIGEST = 3;

/** Minimum episode-count growth since last generation to treat digest as stale (ADR-051). */
export const STALENESS_GROWTH_THRESHOLD = 3;

/** Maximum number of related topics returned by the kNN query on the topic detail page. */
export const RELATED_TOPICS_LIMIT = 5;
