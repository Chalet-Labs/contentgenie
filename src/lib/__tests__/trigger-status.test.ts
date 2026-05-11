import { describe, it, expect } from "vitest";
import {
  TERMINAL_FAILURE_STATUSES,
  TERMINAL_STATUSES,
} from "@/lib/trigger-status";

describe("trigger-status", () => {
  it("TERMINAL_FAILURE_STATUSES contains the six Trigger.dev terminal failure statuses", () => {
    expect(Array.from(TERMINAL_FAILURE_STATUSES).sort()).toEqual([
      "CANCELED",
      "CRASHED",
      "EXPIRED",
      "FAILED",
      "SYSTEM_FAILURE",
      "TIMED_OUT",
    ]);
  });

  it("TERMINAL_STATUSES is the failure set plus COMPLETED", () => {
    expect(Array.from(TERMINAL_STATUSES).sort()).toEqual([
      "CANCELED",
      "COMPLETED",
      "CRASHED",
      "EXPIRED",
      "FAILED",
      "SYSTEM_FAILURE",
      "TIMED_OUT",
    ]);
  });
});
