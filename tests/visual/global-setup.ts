/**
 * Playwright globalSetup for VRT — fetches the Storybook story index and
 * writes the list of story IDs to .story-ids.json so the test file can read
 * it synchronously (avoiding top-level await, which Playwright's require()-
 * based transform cannot handle on Node 22+).
 */
import fs from "node:fs";
import path from "node:path";

const STORYBOOK_URL = process.env.STORYBOOK_URL ?? "http://localhost:6006";

interface StorybookIndex {
  v: number;
  entries: Record<
    string,
    {
      type: "story" | "docs";
      id: string;
      title: string;
      name: string;
    }
  >;
}

async function globalSetup() {
  // Fetch the Storybook index with a timeout guard.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(`${STORYBOOK_URL}/index.json`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    clearTimeout(timeout);
    const reason =
      err instanceof DOMException && err.name === "AbortError"
        ? "request timed out after 10 s"
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(
      `Failed to fetch Storybook index at ${STORYBOOK_URL}/index.json — ` +
        `is the server running? ${reason}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Storybook index: HTTP ${response.status} ${response.statusText} — ` +
        `is Storybook running on ${STORYBOOK_URL}?`,
    );
  }

  let index: StorybookIndex;
  try {
    index = await response.json();
  } catch (err) {
    throw new Error(
      `Storybook index.json is not valid JSON (HTTP ${response.status}). ` +
        `The server may have returned an error page. ` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof index?.entries !== "object" || index.entries === null) {
    throw new Error(
      `Storybook index.json has unexpected shape — expected { entries: {...} } ` +
        `but got keys: [${Object.keys(index ?? {}).join(", ")}]`,
    );
  }

  const storyIds = Object.entries(index.entries)
    .filter(([, entry]) => entry.type === "story")
    .map(([id]) => id);

  if (storyIds.length === 0) {
    const allEntries = Object.values(index.entries);
    const entryTypes = [...new Set(allEntries.map((e) => e.type))];
    throw new Error(
      `No story entries found in Storybook index (found ${allEntries.length} entries ` +
        `with types: [${entryTypes.join(", ")}]). ` +
        `Expected at least one entry with type "story".`,
    );
  }

  // Write story IDs for the test file to read synchronously.
  const outPath = path.join(process.cwd(), "tests/visual/.story-ids.json");
  fs.writeFileSync(outPath, JSON.stringify(storyIds));
}

export default globalSetup;
