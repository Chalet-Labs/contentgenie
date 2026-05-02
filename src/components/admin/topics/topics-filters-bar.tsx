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

  const update = useCallback(
    (key: string, value: string | null) => {
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

  // Keep a stable ref so debounced effects always see the latest `update`.
  const updateRef = useRef(update);
  updateRef.current = update;

  // Debounce min episodes (skip the initial mount trigger).
  const minMounted = useRef(false);
  useEffect(() => {
    if (!minMounted.current) {
      minMounted.current = true;
      return;
    }
    const timer = setTimeout(() => {
      updateRef.current("episodeCountMin", minEpisodes || null);
    }, 250);
    return () => clearTimeout(timer);
  }, [minEpisodes]);

  // Debounce max episodes.
  const maxMounted = useRef(false);
  useEffect(() => {
    if (!maxMounted.current) {
      maxMounted.current = true;
      return;
    }
    const timer = setTimeout(() => {
      updateRef.current("episodeCountMax", maxEpisodes || null);
    }, 250);
    return () => clearTimeout(timer);
  }, [maxEpisodes]);

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
