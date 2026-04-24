import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { ADMIN_ROLE } from "@/lib/auth-roles";
import { getActiveAiConfig } from "@/lib/ai/config";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { interpolatePrompt } from "@/lib/admin/prompt-utils";
import { streamCompletion } from "@/lib/admin/stream-completion";

export async function POST(request: Request) {
  const { userId, has } = await auth();
  if (!userId || !has({ role: ADMIN_ROLE })) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { prompt, episodeId } = body as {
    prompt?: unknown;
    episodeId?: unknown;
  };

  if (typeof prompt !== "string" || !prompt.trim()) {
    return new Response("prompt is required", { status: 422 });
  }
  if (prompt.length > 10000) {
    return new Response("prompt must be 10,000 characters or fewer", {
      status: 422,
    });
  }
  if (!prompt.includes("{{transcript}}")) {
    return new Response("prompt must contain {{transcript}}", { status: 422 });
  }
  if (
    typeof episodeId !== "number" ||
    !Number.isInteger(episodeId) ||
    episodeId <= 0
  ) {
    return new Response("episodeId must be a positive integer", {
      status: 422,
    });
  }

  const episode = await db.query.episodes.findFirst({
    where: eq(episodes.id, episodeId),
    with: { podcast: true },
  });

  if (!episode) {
    return new Response("Episode not found", { status: 422 });
  }
  if (episode.transcriptStatus !== "available" || !episode.transcription) {
    return new Response("Episode transcript is not available", { status: 422 });
  }

  const config = await getActiveAiConfig();

  const interpolated = interpolatePrompt(prompt, {
    title: episode.title,
    podcastName:
      (episode.podcast as { title?: string } | undefined)?.title ??
      "Unknown Podcast",
    description: episode.description ?? "",
    duration: episode.duration ?? 0,
    transcript: episode.transcription,
  });

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = await streamCompletion({
      provider: config.provider,
      model: config.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: interpolated },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to start stream:", err);
    return new Response(`AI provider error: ${message}`, { status: 502 });
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
