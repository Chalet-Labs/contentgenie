// Shared, browser-safe similarity-bucket constants and types. Kept out of
// `resolution-metrics.ts` (which is `server-only`) so client components,
// Storybook stories, and unit tests that only need the bucket grid don't
// transitively import the server module.

export const SIMILARITY_BUCKET_SIZE = 0.05;

export interface SimilarityBucket {
  bucket: number;
  count: number;
}

export interface SimilarityTrendEntry {
  bucket: Date;
  buckets: SimilarityBucket[];
}
