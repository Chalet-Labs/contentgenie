"use server";

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
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
      where: eq(aiConfig.id, 1),
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
    await db
      .insert(aiConfig)
      .values({
        id: 1,
        provider,
        model: trimmedModel,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: aiConfig.id,
        set: {
          provider,
          model: trimmedModel,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      });

    return { success: true };
  } catch (error) {
    console.error("Failed to update AI config:", error);
    return { success: false, error: "Failed to update AI config" };
  }
}
