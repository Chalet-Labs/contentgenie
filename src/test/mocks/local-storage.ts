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
