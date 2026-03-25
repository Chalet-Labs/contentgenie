import type { AiMessage } from "@/lib/ai/types"

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const ZAI_API_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions"

export interface StreamCompletionOptions {
  provider: "openrouter" | "zai"
  model: string
  messages: AiMessage[]
}

/**
 * Makes a streaming request to the AI provider and returns a ReadableStream of text chunks.
 * Uses raw SSE fetch — no Vercel AI SDK (see ADR-008 addendum, decision D2).
 */
export function streamCompletion(options: StreamCompletionOptions): ReadableStream<Uint8Array> {
  const { provider, model, messages } = options

  const apiUrl = provider === "zai" ? ZAI_API_URL : OPENROUTER_API_URL
  const apiKey =
    provider === "zai"
      ? process.env.ZAI_API_KEY ?? ""
      : process.env.OPENROUTER_API_KEY ?? ""

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    headers["X-Title"] = "ContentGenie"
  }

  const body = JSON.stringify({
    model,
    messages,
    stream: true,
    max_tokens: 4096,
    temperature: 0.7,
  })

  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      let response: Response
      try {
        response = await fetch(apiUrl, { method: "POST", headers, body })
      } catch (err) {
        controller.error(err)
        return
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`)
        controller.error(new Error(`AI provider error: ${response.status} - ${errorText}`))
        return
      }

      if (!response.body) {
        controller.error(new Error("No response body from AI provider"))
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) continue

            const data = trimmed.slice(5).trim()
            if (data === "[DONE]") {
              controller.close()
              return
            }

            let parsed: unknown
            try {
              parsed = JSON.parse(data)
            } catch {
              continue
            }

            const content =
              (parsed as { choices?: Array<{ delta?: { content?: string } }> })
                ?.choices?.[0]?.delta?.content ?? ""

            if (content) {
              controller.enqueue(encoder.encode(content))
            }
          }
        }
      } catch (err) {
        controller.error(err)
        return
      }

      controller.close()
    },
  })
}
