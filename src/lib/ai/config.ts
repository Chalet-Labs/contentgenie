import { desc } from "drizzle-orm";
import { db } from "@/db";
import { aiConfig } from "@/db/schema";
import type { AiConfig } from "./types";

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "openrouter",
  model: "google/gemini-2.0-flash-001",
};

export async function getActiveAiConfig(): Promise<AiConfig> {
  try {
    const row = await db.query.aiConfig.findFirst({
      orderBy: [desc(aiConfig.id)],
    });

    if (!row) {
      return DEFAULT_AI_CONFIG;
    }

    return {
      provider: row.provider,
      model: row.model,
    };
  } catch (error) {
    console.error("Failed to read AI config from database, using default:", error);
    return DEFAULT_AI_CONFIG;
  }
}
