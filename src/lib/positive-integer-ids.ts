export function isPositiveIntegerId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

export function uniquePositiveIntegerIds(
  input: unknown,
  opts?: { maxIds?: number },
): number[] {
  if (!Array.isArray(input)) return [];

  const maxIds = opts?.maxIds;
  const seen = new Set<number>();
  const ids: number[] = [];

  for (const value of input) {
    if (maxIds !== undefined && ids.length >= maxIds) break;
    if (!isPositiveIntegerId(value) || seen.has(value)) continue;
    seen.add(value);
    ids.push(value);
  }

  return ids;
}
