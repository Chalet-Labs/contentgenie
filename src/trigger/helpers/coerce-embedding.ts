/**
 * Best-effort coerce of the `identity_embedding` column the DB driver returns.
 * Postgres `vector` may surface as `number[]` (pg JSON path), `string`
 * (`"[1,2,3]"`), or `Float32Array`. The clustering helper expects `number[]`.
 *
 * Returns `null` when the input is malformed: any NaN/non-finite element,
 * empty vector, zero-norm vector (would produce NaN in cosineDistance), or
 * unrecognised shape.
 */
export function coerceEmbedding(raw: unknown): number[] | null {
  let arr: number[];
  if (Array.isArray(raw)) {
    arr = raw.map((v) => Number(v));
  } else if (raw instanceof Float32Array) {
    arr = Array.from(raw);
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (
      trimmed.length >= 2 &&
      trimmed.startsWith("[") &&
      trimmed.endsWith("]")
    ) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner.length === 0) return null;
      arr = inner
        .split(",")
        .filter(Boolean)
        .map((s) => Number(s.trim()));
    } else {
      return null;
    }
  } else {
    return null;
  }
  // Guard: any NaN or ±Infinity element taints the whole vector.
  if (arr.some((x) => !Number.isFinite(x))) return null;
  // Guard: empty or zero-norm vectors produce NaN in cosineDistance.
  if (arr.length === 0) return null;
  const squaredNorm = arr.reduce((sum, x) => sum + x * x, 0);
  if (squaredNorm === 0) return null;
  return arr;
}
