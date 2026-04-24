import { NextRequest } from "next/server";

/**
 * Build a POST `NextRequest` with a JSON body and `Content-Type` header.
 * Collapses the `makeRequest(body)` helper that's otherwise inlined in every
 * API route test.
 */
export function makePostRequest(path: string, body: unknown): NextRequest {
  const url = path.startsWith("http")
    ? path
    : `http://localhost:3000${path.startsWith("/") ? path : `/${path}`}`;
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
