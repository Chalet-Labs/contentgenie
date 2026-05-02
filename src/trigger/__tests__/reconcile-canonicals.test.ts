import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTriggerSdkMock } from "@/test/mocks/trigger-sdk";

// Capture `schedules.task` config payloads. The factory returns the config so
// the imported `reconcileCanonicals` IS the captured config.
// `vi.hoisted` so the spy survives `vi.mock`'s hoisting to the top of the file.
const { scheduleTaskMock } = vi.hoisted(() => ({
  scheduleTaskMock: vi.fn((config: unknown) => config),
}));

vi.mock("@trigger.dev/sdk", () =>
  createTriggerSdkMock({
    schedules: { task: scheduleTaskMock },
  }),
);

// Stub the orchestration helper. The task file's only behavior is wiring
// dependencies + emitting structured logs around `runReconciliation`.
const runReconciliationMock = vi.fn();
vi.mock("@/trigger/helpers/reconcile-canonicals", () => ({
  runReconciliation: (...args: unknown[]) => runReconciliationMock(...args),
}));

// Stub the wired-in deps so we can assert identity equality on the deps object
// passed to runReconciliation.
vi.mock("@/db", () => ({
  db: { __tag: "db" },
}));
vi.mock("@/lib/ai/generate", () => ({
  generateCompletion: vi.fn(),
}));
vi.mock("@/lib/reconcile-clustering", () => ({
  clusterByIdentityEmbedding: vi.fn(),
}));
vi.mock("@/trigger/helpers/database", () => ({
  mergeCanonicals: vi.fn(),
}));

import { reconcileCanonicals } from "@/trigger/reconcile-canonicals";
import * as triggerSdk from "@trigger.dev/sdk";
import { db } from "@/db";
import { generateCompletion } from "@/lib/ai/generate";
import { clusterByIdentityEmbedding } from "@/lib/reconcile-clustering";
import { mergeCanonicals } from "@/trigger/helpers/database";

type ScheduleConfig = {
  id: string;
  cron: string;
  maxDuration: number;
  retry: { maxAttempts: number };
  queue: { concurrencyLimit: number };
  machine: string;
  run: () => Promise<unknown>;
};

const taskConfig = reconcileCanonicals as unknown as ScheduleConfig;

const FULL_SUMMARY = {
  clustersSeen: 3,
  clustersFailed: 0,
  clustersDeferred: 0,
  clustersSkippedWinnerAlreadyMerged: 0,
  mergesExecuted: 2,
  mergesFailed: 0,
  mergesRejectedByPairwise: 1,
  mergesSkippedAlreadyMerged: 0,
  pairwiseVerifyThrew: 0,
  pairwiseVerifyRejected: 0,
  dormancyTransitions: 5,
  episodeCountDrift: 7,
  durationMs: 1234,
};

describe("reconcile-canonicals task", () => {
  beforeEach(() => {
    runReconciliationMock.mockReset();
    (triggerSdk.logger.info as ReturnType<typeof vi.fn>).mockClear();
    (triggerSdk.logger.warn as ReturnType<typeof vi.fn>).mockClear();
    (triggerSdk.logger.error as ReturnType<typeof vi.fn>).mockClear();
  });

  describe("schedule config", () => {
    it("registers the schedule with exact issue-#389 VERIFY values", () => {
      // schedules.task was invoked exactly once at module load.
      expect(scheduleTaskMock).toHaveBeenCalledTimes(1);

      expect(taskConfig.id).toBe("reconcile-canonicals");
      expect(taskConfig.cron).toBe("0 3 * * *");
      expect(taskConfig.maxDuration).toBe(600);
      expect(taskConfig.retry.maxAttempts).toBe(2);
      expect(taskConfig.queue.concurrencyLimit).toBe(1);
      expect(taskConfig.machine).toBe("medium-1x");
    });
  });

  describe("run body", () => {
    it("wires all six concrete deps into runReconciliation", async () => {
      runReconciliationMock.mockResolvedValueOnce(FULL_SUMMARY);

      await taskConfig.run();

      expect(runReconciliationMock).toHaveBeenCalledTimes(1);
      const deps = runReconciliationMock.mock.calls[0][0] as Record<
        string,
        unknown
      >;

      expect(deps.db).toBe(db);
      expect(deps.mergeCanonicals).toBe(mergeCanonicals);
      expect(deps.generateCompletion).toBe(generateCompletion);
      expect(deps.clusterByIdentityEmbedding).toBe(clusterByIdentityEmbedding);
      expect(deps.logger).toBe(triggerSdk.logger);
      expect(typeof deps.now).toBe("function");
      // `now()` must produce a Date (used for time-budget arithmetic).
      const sample = (deps.now as () => Date)();
      expect(sample).toBeInstanceOf(Date);
    });

    it("emits reconcile_start before invoking runReconciliation", async () => {
      const callOrder: string[] = [];
      (triggerSdk.logger.info as ReturnType<typeof vi.fn>).mockImplementation(
        (message: string) => {
          callOrder.push(`info:${message}`);
        },
      );
      runReconciliationMock.mockImplementationOnce(async () => {
        callOrder.push("runReconciliation");
        return FULL_SUMMARY;
      });

      await taskConfig.run();

      expect(callOrder[0]).toBe("info:reconcile_start");
      expect(callOrder).toContain("runReconciliation");
      expect(callOrder.indexOf("info:reconcile_start")).toBeLessThan(
        callOrder.indexOf("runReconciliation"),
      );
    });

    it("emits reconcile_summary with all summary fields and returns the summary", async () => {
      runReconciliationMock.mockResolvedValueOnce(FULL_SUMMARY);

      const result = await taskConfig.run();

      expect(result).toEqual(FULL_SUMMARY);

      const summaryCall = (
        triggerSdk.logger.info as ReturnType<typeof vi.fn>
      ).mock.calls.find(([msg]) => msg === "reconcile_summary");
      expect(summaryCall).toBeDefined();
      expect(summaryCall![1]).toEqual({
        event: "reconcile_summary",
        ...FULL_SUMMARY,
      });
    });

    it("logs reconcile_failed and rethrows when runReconciliation throws", async () => {
      const boom = new Error("upstream fail");
      runReconciliationMock.mockRejectedValueOnce(boom);

      await expect(taskConfig.run()).rejects.toBe(boom);

      const failedCall = (
        triggerSdk.logger.error as ReturnType<typeof vi.fn>
      ).mock.calls.find(([msg]) => msg === "reconcile_failed");
      expect(failedCall).toBeDefined();
      const meta = failedCall![1] as Record<string, unknown>;
      expect(meta.event).toBe("reconcile_failed");
      expect(meta.message).toBe("upstream fail");
      expect(typeof meta.durationMs).toBe("number");
      expect(meta.durationMs).toBeGreaterThanOrEqual(0);

      // `reconcile_summary` must NOT be emitted when the run failed.
      const summaryCall = (
        triggerSdk.logger.info as ReturnType<typeof vi.fn>
      ).mock.calls.find(([msg]) => msg === "reconcile_summary");
      expect(summaryCall).toBeUndefined();
    });

    it("stringifies non-Error throws in the reconcile_failed message", async () => {
      runReconciliationMock.mockRejectedValueOnce("plain string error");

      await expect(taskConfig.run()).rejects.toBe("plain string error");

      const failedCall = (
        triggerSdk.logger.error as ReturnType<typeof vi.fn>
      ).mock.calls.find(([msg]) => msg === "reconcile_failed");
      expect(failedCall).toBeDefined();
      expect((failedCall![1] as Record<string, unknown>).message).toBe(
        "plain string error",
      );
    });
  });
});
