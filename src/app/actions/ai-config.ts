"use server";

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConfig } from "@/db/schema";
import type { AiConfig, AiProviderName } from "@/lib/ai";
import { DEFAULT_AI_CONFIG } from "@/lib/ai";
import { ADMIN_ROLE } from "@/lib/auth-roles";
import type { ActionResult } from "@/types/action-result";

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
        summarizationPrompt: row.summarizationPrompt ?? null,
      },
    };
  } catch (error) {
    console.error("Failed to read AI config:", error);
    return { config: DEFAULT_AI_CONFIG, error: "Failed to read AI config" };
  }
}

export async function updateSummarizationPrompt(
  prompt: string | null
): Promise<ActionResult> {
  const { userId, has } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in" };
  }

  if (!has({ role: ADMIN_ROLE })) {
    return { success: false, error: "Admin access required" };
  }

  if (prompt !== null) {
    if (!prompt.trim()) {
      return { success: false, error: "Prompt cannot be empty" };
    }
    if (prompt.length > 10000) {
      return { success: false, error: "Prompt must be 10,000 characters or fewer" };
    }
    if (!prompt.includes("{{transcript}}")) {
      return { success: false, error: "Prompt must contain {{transcript}}" };
    }
  }

  try {
    await db
      .insert(aiConfig)
      .values({
        id: 1,
        provider: DEFAULT_AI_CONFIG.provider,
        model: DEFAULT_AI_CONFIG.model,
        summarizationPrompt: prompt,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: aiConfig.id,
        set: {
          summarizationPrompt: prompt,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      });

    return { success: true };
  } catch (error) {
    console.error("Failed to update summarization prompt:", error);
    return { success: false, error: "Failed to update summarization prompt" };
  }
}

export async function updateAiConfig(
  provider: AiProviderName,
  model: string
): Promise<ActionResult> {
  const { userId, has } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in" };
  }

  if (!has({ role: ADMIN_ROLE })) {
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
