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
      const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

      let limiter: RateLimiterPostgres;
      limiter = new RateLimiterPostgres({
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
      "msBeforeNext" in rejection
    ) {
      return {
        allowed: false,
        retryAfterMs: (rejection as { msBeforeNext: number }).msBeforeNext,
      };
    }
    throw rejection;
  }
}
