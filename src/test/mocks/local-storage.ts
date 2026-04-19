/**
 * In-memory `Storage` mock for tests that install a fresh localStorage per
 * case (via `Object.defineProperty(window, "localStorage", ...)`).
 *
 * jsdom ships a real localStorage, but its state persists across tests in
 * the same worker. Test files that want deterministic isolation replace
 * `window.localStorage` with a fresh instance of this mock per test.
 */
export function createLocalStorageMock(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key]
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
}

/**
 * Install a fresh in-memory localStorage mock on `window`. Returns the mock
 * so callers can further customize it (e.g. make `setItem` throw for a quota
 * test). Use in `beforeEach` to guarantee an isolated storage per case.
 */
export function installLocalStorageMock(): Storage {
  const mock = createLocalStorageMock()
  Object.defineProperty(window, "localStorage", {
    value: mock,
    writable: true,
    configurable: true,
  })
  return mock
}

/**
 * Install a localStorage mock whose `setItem` always throws
 * `QuotaExceededError`. Use to verify that save-side code handles quota
 * gracefully without throwing.
 */
export function installQuotaExceededLocalStorage(): Storage {
  const mock = createLocalStorageMock()
  mock.setItem = () => {
    throw new DOMException("QuotaExceededError")
  }
  Object.defineProperty(window, "localStorage", {
    value: mock,
    writable: true,
    configurable: true,
  })
  return mock
}

/**
 * Run `fn` with `globalThis.window` temporarily removed, simulating SSR.
 * Restores the original `window` even if `fn` throws.
 */
export function withoutWindow(fn: () => void): void {
  const originalWindow = globalThis.window
  try {
    // @ts-expect-error -- simulating SSR
    delete globalThis.window
    fn()
  } finally {
    globalThis.window = originalWindow
  }
}
