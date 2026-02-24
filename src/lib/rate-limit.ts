import { Pool } from "@neondatabase/serverless";
import {
  RateLimiterPostgres,
  RateLimiterMemory,
} from "rate-limiter-flexible";

const RATE_LIMIT_POINTS = 10;
const RATE_LIMIT_DURATION = 3600; // 1 hour in seconds

let limiterPromise: Promise<RateLimiterPostgres> | null = null;

function getLimiter(): Promise<RateLimiterPostgres> {
  if (!limiterPromise) {
    limiterPromise = new Promise<RateLimiterPostgres>((resolve, reject) => {
      try {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error("DATABASE_URL environment variable is not set.");
        }
        const pool = new Pool({ connectionString });

        const limiter = new RateLimiterPostgres({
          storeClient: pool,
          storeType: "pool",
          points: RATE_LIMIT_POINTS,
          duration: RATE_LIMIT_DURATION,
          tableName: "rate_limits",
          keyPrefix: "summarize",
          clearExpiredByTimeout: false,
          insuranceLimiter: new RateLimiterMemory({
            points: RATE_LIMIT_POINTS,
            duration: RATE_LIMIT_DURATION,
          }),
        }, (err?: Error) => {
          if (err) {
            limiterPromise = null;
            reject(err);
          } else {
            resolve(limiter);
          }
        });
      } catch (err) {
        limiterPromise = null;
        reject(err);
      }
    });
  }
  return limiterPromise;
}

export async function checkRateLimit(
  userId: string,
  points = 1
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const limiter = await getLimiter();
  try {
    await limiter.consume(userId, points);
    return { allowed: true };
  } catch (rejection: unknown) {
    if (
      rejection &&
      typeof rejection === "object" &&
      "msBeforeNext" in rejection &&
      typeof (rejection as { msBeforeNext: unknown }).msBeforeNext === "number"
    ) {
      return {
        allowed: false,
        retryAfterMs: (rejection as { msBeforeNext: number }).msBeforeNext,
      };
    }
    throw rejection;
  }
}

/**
 * Create a rate limit checker with custom configuration.
 * Uses RateLimiterPostgres for distributed rate limiting across serverless instances,
 * with an in-memory insurance limiter as fallback (per ADR-001).
 */
export function createRateLimitChecker(config: {
  points: number;
  duration: number;
  keyPrefix: string;
}): (userId: string, points?: number) => Promise<{ allowed: boolean; retryAfterMs?: number }> {
  let promise: Promise<RateLimiterPostgres> | null = null;

  function getLimiterInstance(): Promise<RateLimiterPostgres> {
    if (!promise) {
      promise = new Promise<RateLimiterPostgres>((resolve, reject) => {
        try {
          const connectionString = process.env.DATABASE_URL;
          if (!connectionString) {
            throw new Error("DATABASE_URL environment variable is not set.");
          }
          const pool = new Pool({ connectionString });

          const limiter = new RateLimiterPostgres({
            storeClient: pool,
            storeType: "pool",
            points: config.points,
            duration: config.duration,
            tableName: "rate_limits",
            keyPrefix: config.keyPrefix,
            clearExpiredByTimeout: false,
            insuranceLimiter: new RateLimiterMemory({
              points: config.points,
              duration: config.duration,
            }),
          }, (err?: Error) => {
            if (err) {
              promise = null;
              reject(err);
            } else {
              resolve(limiter);
            }
          });
        } catch (err) {
          promise = null;
          reject(err);
        }
      });
    }
    return promise;
  }

  return async (userId: string, pts = 1) => {
    const limiter = await getLimiterInstance();
    try {
      await limiter.consume(userId, pts);
      return { allowed: true };
    } catch (rejection: unknown) {
      if (
        rejection &&
        typeof rejection === "object" &&
        "msBeforeNext" in rejection &&
        typeof (rejection as { msBeforeNext: unknown }).msBeforeNext === "number"
      ) {
        return {
          allowed: false,
          retryAfterMs: (rejection as { msBeforeNext: number }).msBeforeNext,
        };
      }
      throw rejection;
    }
  };
}
