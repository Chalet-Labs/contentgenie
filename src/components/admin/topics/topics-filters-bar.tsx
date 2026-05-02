"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canonicalTopicStatusEnum, canonicalTopicKindEnum } from "@/db/schema";

const STATUS_OPTIONS = canonicalTopicStatusEnum.enumValues;
const KIND_OPTIONS = canonicalTopicKindEnum.enumValues;

type UpdateFn = (key: string, value: string | null) => void;

/**
 * Mirrors a controlled input value into a search-param after `delay` ms,
 * skipping the initial mount so we don't push a duplicate of the URL state
 * back into the URL. Holds `update` behind a ref so a stale closure can't
 * win over a fresh value.
 */
function useDebouncedSearchParam(
  value: string,
  paramKey: string,
  update: UpdateFn,
  delay = 250,
) {
  const updateRef = useRef(update);
  updateRef.current = update;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const timer = setTimeout(() => {
      updateRef.current(paramKey, value || null);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, paramKey, delay]);
}

export function TopicsFiltersBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [minEpisodes, setMinEpisodes] = useState(
    searchParams.get("episodeCountMin") ?? "",
  );
  const [maxEpisodes, setMaxEpisodes] = useState(
    searchParams.get("episodeCountMax") ?? "",
  );

  // Resync local state when the URL changes externally (back/forward navigation
  // or other router pushes that update episodeCountMin/Max without user input).
  useEffect(() => {
    setMinEpisodes(searchParams.get("episodeCountMin") ?? "");
    setMaxEpisodes(searchParams.get("episodeCountMax") ?? "");
  }, [searchParams]);

  const update = useCallback<UpdateFn>(
    (key, value) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  useDebouncedSearchParam(minEpisodes, "episodeCountMin", update);
  useDebouncedSearchParam(maxEpisodes, "episodeCountMax", update);

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        placeholder="Search topics…"
        className="max-w-xs"
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => update("search", e.target.value || null)}
        aria-label="Search topics"
      />

      <Select
        value={searchParams.get("status") ?? ""}
        onValueChange={(v) => update("status", v === "all" ? null : v)}
      >
        <SelectTrigger className="w-36" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("kind") ?? ""}
        onValueChange={(v) => update("kind", v === "all" ? null : v)}
      >
        <SelectTrigger className="w-36" aria-label="Filter by kind">
          <SelectValue placeholder="All kinds" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All kinds</SelectItem>
          {KIND_OPTIONS.map((k) => (
            <SelectItem key={k} value={k}>
              {k}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* T9: Ongoing tri-state filter */}
      <Select
        value={searchParams.get("ongoing") ?? ""}
        onValueChange={(v) => update("ongoing", v === "any" ? null : v)}
      >
        <SelectTrigger className="w-32" aria-label="Filter by ongoing status">
          <SelectValue placeholder="Any" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any</SelectItem>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>

      {/* T9: Episode-count range inputs (debounced 250 ms) */}
      <Input
        type="number"
        min={0}
        placeholder="Min episodes"
        className="w-32"
        aria-label="Min episodes"
        value={minEpisodes}
        onChange={(e) => setMinEpisodes(e.target.value)}
      />
      <Input
        type="number"
        min={0}
        placeholder="Max episodes"
        className="w-32"
        aria-label="Max episodes"
        value={maxEpisodes}
        onChange={(e) => setMaxEpisodes(e.target.value)}
      />
    </div>
  );
}
