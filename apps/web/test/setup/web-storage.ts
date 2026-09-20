/**
 * Restores `localStorage` in the jsdom test environment.
 *
 * Node 26 ships an experimental `localStorage` global of its own. It is a
 * getter that warns and evaluates to `undefined` unless the process was
 * started with `--localstorage-file`. Because the property already exists on
 * `globalThis`, vitest's jsdom environment does not overwrite it — so jsdom's
 * `Storage` never lands, `sessionStorage` works and `localStorage` is
 * `undefined`. Any module touching it at import time (the auth slice reads
 * `idp_url` while the zustand store is constructed) takes the whole suite
 * down with it.
 *
 * jsdom's own `Storage` cannot be constructed directly, so this is a minimal
 * in-memory implementation of the Web Storage API. It is deliberately defined
 * only when the global is missing: if a future Node or jsdom release stops
 * shadowing, the real implementation wins.
 */

class MemoryStorage implements Storage {
    #entries = new Map<string, string>()

    get length(): number {
        return this.#entries.size
    }

    key(index: number): string | null {
        return [...this.#entries.keys()][index] ?? null
    }

    getItem(key: string): string | null {
        return this.#entries.get(String(key)) ?? null
    }

    setItem(key: string, value: string): void {
        this.#entries.set(String(key), String(value))
    }

    removeItem(key: string): void {
        this.#entries.delete(String(key))
    }

    clear(): void {
        this.#entries.clear()
    }
}

if (typeof globalThis.localStorage === "undefined") {
    Object.defineProperty(globalThis, "localStorage", {
        value: new MemoryStorage(),
        configurable: true,
        writable: true,
    })
}
