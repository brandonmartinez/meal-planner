import { afterAll, afterEach, beforeAll, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { server } from "./msw/server";

function createStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

function storageWorks(storage: Storage | undefined): storage is Storage {
  try {
    if (
      !storage ||
      typeof storage.clear !== "function" ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function"
    ) {
      return false;
    }

    storage.setItem("__vitest_storage_check__", "1");
    const works = storage.getItem("__vitest_storage_check__") === "1";
    storage.removeItem("__vitest_storage_check__");
    return works;
  } catch {
    return false;
  }
}

if (!storageWorks(window.localStorage)) {
  const storage = createStorage();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

// Polyfill matchMedia for jsdom (used by ThemeContext)
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  window.localStorage.clear();
});
afterAll(() => server.close());
