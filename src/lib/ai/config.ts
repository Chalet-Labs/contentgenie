import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConfig } from "@/db/schema";
import type { AiConfig } from "@/lib/ai/types";

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "openrouter",
  model: "google/gemini-2.0-flash-001",
  summarizationPrompt: null,
};

interface GetActiveAiConfigOptions {
  throwOnDbError?: boolean;
}

export async function getActiveAiConfig(
  options?: GetActiveAiConfigOptions,
): Promise<AiConfig> {
  let row;
  try {
    row = await db.query.aiConfig.findFirst({
      where: eq(aiConfig.id, 1),
    });
  } catch (error) {
    if (options?.throwOnDbError) {
      throw error;
    }

    console.error("[ai-config] Failed to read AI config from database, using default", {
      event: "ai_config_db_error",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return DEFAULT_AI_CONFIG;
  }

  if (!row) {
    return DEFAULT_AI_CONFIG;
  }

  return {
    provider: row.provider,
    model: row.model,
    summarizationPrompt: row.summarizationPrompt ?? null,
  };
}
