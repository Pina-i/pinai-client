/**
 * Unit tests for the fade-window math behind `MessageStatus`.
 *
 * The icon-mapping + aria-attribute behaviour is covered by manual QA
 * (the project doesn't include `@testing-library/react`, and rolling
 * raw `ReactDOM.createRoot` tests for a 3-icon component is more
 * fragile than the manual pass it would replace). The fade-window
 * decision is the only piece with non-trivial logic, so it gets its
 * own pure-helper test.
 */
import { describe, expect, it } from "vitest"

import {
    SENT_FADE_MS,
    shouldShowSentIcon,
} from "@/presentation/molecules/MessageStatus/MessageStatus.helper"

describe("shouldShowSentIcon", () => {
    const at = "2026-05-11T12:00:00.000Z"
    const atMs = new Date(at).getTime()

    it("returns false for non-sent status", () => {
        expect(shouldShowSentIcon("sending", at, atMs + 1000)).toBe(false)
        expect(shouldShowSentIcon("failed", at, atMs + 1000)).toBe(false)
        expect(shouldShowSentIcon(undefined, at, atMs + 1000)).toBe(false)
    })

    it("returns false when statusAt is missing", () => {
        expect(shouldShowSentIcon("sent", undefined, atMs)).toBe(false)
    })

    it("returns true within the fade window", () => {
        expect(shouldShowSentIcon("sent", at, atMs)).toBe(true)
        expect(shouldShowSentIcon("sent", at, atMs + 1000)).toBe(true)
        expect(shouldShowSentIcon("sent", at, atMs + SENT_FADE_MS - 1)).toBe(true)
    })

    it("returns false at or past the fade window boundary", () => {
        expect(shouldShowSentIcon("sent", at, atMs + SENT_FADE_MS)).toBe(false)
        expect(shouldShowSentIcon("sent", at, atMs + SENT_FADE_MS + 1)).toBe(false)
        // Reload case: status survived persistence, so `statusAt` is
        // hours old by the time the component mounts.
        expect(shouldShowSentIcon("sent", at, atMs + 3_600_000)).toBe(false)
    })

    it("defaults `now` to Date.now() when omitted", () => {
        // We can't pin Date.now without mocking, but a `statusAt`
        // exactly at "now ± 100 ms" is well inside the 3-second
        // window, so the call must return true.
        const recent = new Date(Date.now() - 100).toISOString()
        expect(shouldShowSentIcon("sent", recent)).toBe(true)
    })
})
