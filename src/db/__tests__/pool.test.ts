import { describe, it, expect, vi, beforeEach } from "vitest";

const { MockPool, mockTransaction } = vi.hoisted(() => {
  class MockPool {}
  const mockTransaction = vi.fn();
  return { MockPool, mockTransaction };
});

vi.mock("@neondatabase/serverless", () => ({
  Pool: MockPool,
  neonConfig: { webSocketConstructor: undefined },
}));

vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: vi.fn(() => ({ transaction: mockTransaction })),
}));

vi.mock("ws", () => ({ default: {} }));

import { transactional } from "@/db/pool";

describe("transactional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgres://test";
  });

  it("without options.tx: delegates to getDbPool().transaction()", async () => {
    mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({ mock: "tx" }),
    );
    const fn = vi.fn().mockResolvedValue("result");

    await transactional(fn);

    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith({ mock: "tx" });
  });

  it("with options.tx: calls fn(options.tx) directly, bypasses pool", async () => {
    const callerTx = { mock: "caller-tx" } as unknown as Parameters<
      typeof transactional
    >[0] extends (tx: infer T) => unknown
      ? T
      : never;
    const fn = vi.fn().mockResolvedValue("ok");

    await transactional(fn, { tx: callerTx });

    expect(fn).toHaveBeenCalledWith(callerTx);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
