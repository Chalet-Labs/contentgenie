/**
 * Type-level tests for PodcastIndexEpisodeId brand.
 *
 * Note: vitest does not type-check source files — the TypeScript compiler
 * (run as part of `bun run build` → `next build` → `tsc --noEmit`) is what
 * enforces the `@ts-expect-error` directives below. If a brand constraint
 * is removed or widened, the corresponding `@ts-expect-error` becomes unused
 * and tsc flags the test file as a build error — that IS the assertion.
 *
 * The vitest `expect` body is minimal: just enough to exercise the module so
 * the file is included in the test run (and coverage tooling) without dead code.
 */

import { describe, expect, it } from "vitest";

import {
  asPodcastIndexEpisodeId,
  type PodcastIndexEpisodeId,
} from "@/types/ids";

// A throwaway "other" brand to verify cross-brand non-interchangeability.
type OtherBrandedId = string & { readonly __brand: "OtherBrandedId" };

describe("PodcastIndexEpisodeId brand", () => {
  it("constructor is a transparent cast at runtime", () => {
    expect(asPodcastIndexEpisodeId("12345")).toBe("12345");
    expect(asPodcastIndexEpisodeId("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Type-level assertions (enforced by tsc, not vitest)
// ---------------------------------------------------------------------------

// 1. A plain string (e.g. String(dbEpisode.id)) is NOT assignable to
//    PodcastIndexEpisodeId[].
function _acceptsEpisodeIdArray(_ids: PodcastIndexEpisodeId[]): void {}

const _plainString: string = "42";
// @ts-expect-error — plain string not assignable to PodcastIndexEpisodeId[]
_acceptsEpisodeIdArray([_plainString]);

// 2. A numeric DB id coerced to string is NOT assignable.
const _numericDbId: number = 99;
// @ts-expect-error — String(dbEpisodeId) plain string not assignable to PodcastIndexEpisodeId[]
_acceptsEpisodeIdArray([String(_numericDbId)]);

// 3. Two different branded ids are not interchangeable.
function _acceptsOtherBrand(_id: OtherBrandedId): void {}

const _piId = asPodcastIndexEpisodeId("42");
// @ts-expect-error — PodcastIndexEpisodeId not assignable to OtherBrandedId
_acceptsOtherBrand(_piId);

// 4. Positive: the constructor output IS assignable to PodcastIndexEpisodeId[].
const _brandedArray: PodcastIndexEpisodeId[] = [asPodcastIndexEpisodeId("1")];
_acceptsEpisodeIdArray(_brandedArray);
