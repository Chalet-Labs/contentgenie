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
  try {
    const row = await db.query.aiConfig.findFirst({
      where: eq(aiConfig.id, 1),
    });

    if (!row) {
      return DEFAULT_AI_CONFIG;
    }

    return {
      provider: row.provider,
      model: row.model,
      summarizationPrompt: row.summarizationPrompt ?? null,
    };
  } catch (error) {
    if (options?.throwOnDbError) {
      throw error;
    }

    console.warn(
      JSON.stringify({
        level: "warn",
        event: "ai_config_db_error",
        message: "Failed to read AI config from database, using default",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return DEFAULT_AI_CONFIG;
  }
}
