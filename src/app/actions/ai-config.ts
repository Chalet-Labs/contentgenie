"use server";

import { auth } from "@clerk/nextjs/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { aiConfig } from "@/db/schema";
import type { AiConfig, AiProviderName } from "@/lib/ai";
import { DEFAULT_AI_CONFIG } from "@/lib/ai";

const VALID_PROVIDERS: AiProviderName[] = ["openrouter", "zai"];

export async function getAiConfig(): Promise<{
  config: AiConfig;
  error?: string;
}> {
  try {
    const row = await db.query.aiConfig.findFirst({
      orderBy: [desc(aiConfig.id)],
    });

    if (!row) {
      return { config: DEFAULT_AI_CONFIG };
    }

    return {
      config: {
        provider: row.provider,
        model: row.model,
      },
    };
  } catch (error) {
    console.error("Failed to read AI config:", error);
    return { config: DEFAULT_AI_CONFIG, error: "Failed to read AI config" };
  }
}

export async function updateAiConfig(
  provider: AiProviderName,
  model: string
): Promise<{ success: boolean; error?: string }> {
  const { userId, has } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in" };
  }

  if (!has({ role: "org:admin" })) {
    return { success: false, error: "Admin access required" };
  }

  if (!VALID_PROVIDERS.includes(provider)) {
    return { success: false, error: "Invalid provider" };
  }

  const trimmedModel = model.trim();
  if (!trimmedModel) {
    return { success: false, error: "Model name is required" };
  }

  try {
    // Query for existing row
    const existing = await db.query.aiConfig.findFirst({
      orderBy: [desc(aiConfig.id)],
      columns: { id: true },
    });

    if (existing) {
      await db
        .update(aiConfig)
        .set({
          provider,
          model: trimmedModel,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(aiConfig.id, existing.id));
    } else {
      await db.insert(aiConfig).values({
        provider,
        model: trimmedModel,
        updatedBy: userId,
        updatedAt: new Date(),
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to update AI config:", error);
    return { success: false, error: "Failed to update AI config" };
  }
}
