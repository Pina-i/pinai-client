/**
 * The GIF picker's key. An instance hands its clients the Klipy key they search with in its
 * NodeInfo (`metadata.gifs`, `identity-provider/specs/identity.md § 6`), so the web app and the
 * desktop app, whichever deployment or build they come from, search with the instance's own — and
 * with no other: an instance without one has no GIF picker.
 */

import { PINAI_SOFTWARE } from "./instance"

// What the IdP lets through (`KlipyKey`): the key is written into a URL path.
const KLIPY_KEY = /^[A-Za-z0-9_-]{1,256}$/

function record(raw: unknown): Record<string, unknown> {
    return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
}

/** A Klipy key as a client may use it, else `null`. */
export function klipyKey(raw: unknown): string | null {
    if (typeof raw !== "string") return null
    const key = raw.trim()
    return KLIPY_KEY.test(key) ? key : null
}

/** The Klipy key a Pīna'i instance's NodeInfo document hands out, `null` without one. */
export function nodeInfoKlipyKey(document: unknown): string | null {
    const doc = record(document)
    if (record(doc.software).name !== PINAI_SOFTWARE) return null
    const gifs = record(record(doc.metadata).gifs)
    return gifs.provider === "klipy" ? klipyKey(gifs.apiKey) : null
}
