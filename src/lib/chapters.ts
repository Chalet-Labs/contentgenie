/**
 * Chapter type and JSON Chapters parser/validator.
 * Spec: https://github.com/Podcastindex-org/podcast-namespace/blob/main/chapters/jsonChapters.md
 */

export interface Chapter {
  startTime: number;
  title: string;
  img?: string;
  url?: string;
}

/**
 * Parse and validate a JSON Chapters payload.
 *
 * - Filters out entries missing a numeric `startTime`
 * - Filters out entries with `toc: false` (silent markers)
 * - Generates "Chapter N" fallback for entries without a title
 * - Sorts by `startTime` ascending
 * - Returns an empty array for any malformed input
 */
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseChapters(json: unknown): Chapter[] {
  if (
    typeof json !== "object" ||
    json === null ||
    !Object.hasOwn(json as object, "chapters") ||
    !Array.isArray((json as Record<string, unknown>).chapters)
  ) {
    return [];
  }

  const raw = (json as Record<string, unknown>).chapters as unknown[];

  const chapters: Chapter[] = [];

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];

    if (typeof entry !== "object" || entry === null) continue;

    const record = entry as Record<string, unknown>;

    if (
      typeof record.startTime !== "number" ||
      !Number.isFinite(record.startTime) ||
      record.startTime < 0
    ) {
      continue;
    }

    if (record.toc === false) continue;

    const chapter: Chapter = {
      startTime: record.startTime,
      title:
        typeof record.title === "string" && record.title.trim() !== ""
          ? record.title
          : `Chapter ${chapters.length + 1}`,
    };

    if (
      typeof record.img === "string" &&
      record.img.trim() !== "" &&
      isHttpUrl(record.img)
    ) {
      chapter.img = record.img;
    }

    if (
      typeof record.url === "string" &&
      record.url.trim() !== "" &&
      isHttpUrl(record.url)
    ) {
      chapter.url = record.url;
    }

    chapters.push(chapter);
  }

  chapters.sort((a, b) => a.startTime - b.startTime);

  return chapters;
}
