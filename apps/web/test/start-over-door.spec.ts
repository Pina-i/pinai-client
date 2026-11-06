/**
 * The start over prompt (`identity-provider/specs/e2ee.md § 3.12`, § 6.13): read at each load, on
 * `start_over_requested` and when the socket comes back, shown whenever the IdP answers another
 * device's open request — it shows one only to the devices that may cancel it —, closed on
 * `start_over_cancelled`; "Cancel — it wasn't me" with no password, then how to change the password
 * as the instance's mode allows; "It's me" only on a device that can answer a code; "Not now" for
 * this page load.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UserProfile } from "@pinai/domain/models/auth"
import type { HistoryKeyStanding } from "@pinai/domain/models/history-key"
import { IdpError } from "@pinai/domain/models/idp-error"
import type { StartOverRequest } from "@pinai/domain/models/start-over"
import type { StartOverEvent } from "@/presentation/hooks/useIdpWebSocket"
import { StartOverDoor } from "@/presentation/organisms/StartOverDoor/StartOverDoor"
import { useAppStore } from "@/store/store"

const THIS = "550e8400-e29b-41d4-a716-446655440000"
const THEM = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"

const wired = vi.hoisted(() => ({
    standing: null as unknown,
    request: null as unknown,
    open: true,
    push: null as ((event: StartOverEvent) => void) | null,
    read: null as unknown as ReturnType<typeof vi.fn>,
    end: null as unknown as ReturnType<typeof vi.fn>,
}))
vi.mock("@/ioc", () => ({
    getE2eePort: () => ({ historyKeyStanding: async () => wired.standing, getDeviceId: async () => THIS }),
    getStartOverPort: () => ({ read: wired.read, end: wired.end, ask: vi.fn() }),
    getNodeInfoPort: () => ({
        links: async (origin: string) => ({ links: [{ rel: "http://nodeinfo.diaspora.software/ns/schema/2.1", href: `${origin}/nodeinfo/2.1` }] }),
        document: async () => ({ software: { name: "pinai" }, openRegistrations: wired.open, usage: { users: { total: 3 } }, metadata: { nodeName: "Test" } }),
    }),
}))
vi.mock("@/presentation/hooks/useIdpWebSocket", () => ({
    registerStartOverHandler: (handler: (event: StartOverEvent) => void) => {
        wired.push = handler
        return () => {
            if (wired.push === handler) wired.push = null
        }
    },
}))

let root: Root | null = null
let container: HTMLElement

function asked(id: string): StartOverRequest {
    return { id, deviceId: THEM, displayName: "Chrome on Windows", createdAt: Date.now() - 3 * 60_000, readyAt: Date.now() + 7 * 86_400_000, ended: null }
}

async function render(): Promise<void> {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root?.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(StartOverDoor)))
    })
}

async function until(check: () => boolean) {
    for (let i = 0; i < 200 && !check(); i++) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5)
        })
    }
    expect(check()).toBe(true)
}

const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]')
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)
const press = (target: HTMLElement | undefined) => act(async () => target?.click())
const push = (event: StartOverEvent) => act(async () => wired.push?.(event))

const HOLDS: HistoryKeyStanding = { kind: "holds", generation: 1, settled: true }

/** `request`: what the IdP answers this device — an `IdpError` for a refusal. */
function given(standing: HistoryKeyStanding, request: StartOverRequest | IdpError | null, admin = false) {
    wired.standing = standing
    wired.request = request
    wired.read = vi.fn(async () => (wired.request instanceof IdpError ? Promise.reject(wired.request) : wired.request))
    wired.end = vi.fn(async () => undefined)
    useAppStore.setState({ idpUrl: "https://idp.test", accessToken: "tok", user: { actor_uri: "https://idp.test/users/alice", admin } as UserProfile })
}

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
    if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
    wired.open = true
    useAppStore.setState({ wsStatus: "disconnected" })
})

afterEach(async () => {
    if (root) {
        const leaving = root
        root = null
        await act(async () => leaving.unmount())
        container.remove()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("the start over prompt", () => {
    it("asks an approved device about another device's request: who, what it means, and the three answers", async () => {
        given(HOLDS, asked("r-asks"))
        await render()
        await until(() => dialog() !== null)

        expect(dialog()?.getAttribute("aria-label")).toBe("Is this you?")
        const text = dialog()?.textContent ?? ""
        expect(text).toContain("Someone asked to start your history over from Chrome on Windows.")
        expect(text).toContain(
            "If nobody uses this device or another of your approved devices for 7 days, Chrome on Windows can erase your history backup and set new words for your account. Until then, you can cancel it from here.",
        )
        expect(text).toContain("asked 3 minutes ago · idp.test")
        for (const label of ["Cancel — it wasn't me", "It's me — approve with a code instead", "Not now"]) expect(button(label)).toBeDefined()
    })

    it("shows nothing when the IdP doesn't count this device among those who may cancel it", async () => {
        given(HOLDS, new IdpError(403, "approval_required", "refused"))
        await render()
        await until(() => wired.read.mock.calls.length > 0)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(200)
        })
        expect(dialog()).toBeNull()
    })

    it("shows the request whatever this device last found of itself, offering the code only to one that can answer it", async () => {
        given({ kind: "mismatch", generation: 2, setByDevice: THEM, reason: "check-value", held: 1 }, asked("r-stale"))
        await render()
        await until(() => dialog() !== null)
        expect(button("Cancel — it wasn't me")).toBeDefined()
        expect(button("It's me — approve with a code instead")).toBeUndefined()
    })

    it("reads the request again when the socket comes back: a push it missed isn't replayed", async () => {
        given(HOLDS, null)
        useAppStore.setState({ wsStatus: "connected" })
        await render()
        await until(() => wired.read.mock.calls.length === 1)
        expect(dialog()).toBeNull()

        wired.request = asked("r-missed")
        await act(async () => useAppStore.setState({ wsStatus: "disconnected" }))
        await act(async () => useAppStore.setState({ wsStatus: "connected" }))
        await until(() => dialog() !== null)
        expect(wired.read).toHaveBeenCalledTimes(2)
    })

    it("cancels with no password, then says someone has the password and how to change it on an open instance", async () => {
        given(HOLDS, asked("r-cancel"))
        await render()
        await until(() => button("Cancel — it wasn't me") !== undefined)

        await press(button("Cancel — it wasn't me"))
        await until(() => dialog()?.getAttribute("aria-label") === "Cancelled.")
        expect(wired.end).toHaveBeenCalledWith("https://idp.test", "tok", "r-cancel")
        // The IdP's own push follows the cancel: the advice stays until the user is done.
        wired.request = null
        await push({ type: "start_over_cancelled", data: { request_id: "r-cancel", reason: "cancelled" } })
        await until(() => (dialog()?.textContent ?? "").includes("Forgot password?"))
        const text = dialog()?.textContent ?? ""
        expect(text).toContain("This request is cancelled, but Chrome on Windows can ask again: whoever asked from it has your password. Change it now.")
        expect(text).toContain(`Sign out, then choose "Forgot password?" on idp.test's sign-in page: the reset link signs every device out, theirs too.`)
        expect(text).toContain("Then sign Chrome on Windows out in Settings → Devices.")

        await press(button("Done"))
        await until(() => dialog() === null)
    })

    it("says a refused cancel in plain words, never as the instance out of reach", async () => {
        given(HOLDS, asked("r-refused"))
        wired.end = vi.fn(async () => Promise.reject(new IdpError(403, "approval_required", "This takes a device approved under the current history key")))
        await render()
        await until(() => button("Cancel — it wasn't me") !== undefined)
        await press(button("Cancel — it wasn't me"))
        await until(() => (dialog()?.textContent ?? "").includes("Only an approved device can cancel it, and your instance doesn't count this one as approved."))
        expect(dialog()?.textContent).not.toContain("Couldn't reach your instance")
        expect(dialog()?.getAttribute("aria-label")).toBe("Is this you?")
    })

    it("on an invite-only instance, points to an admin's reset link — and an admin to where the instance is run", async () => {
        wired.open = false
        given(HOLDS, asked("r-invite"))
        await render()
        await until(() => button("Cancel — it wasn't me") !== undefined)
        await press(button("Cancel — it wasn't me"))
        await until(() => (dialog()?.textContent ?? "").includes("Ask an admin of idp.test for a password reset link"))
        await press(button("Done"))
        await act(async () => root?.unmount())
        root = null
        container.remove()

        wired.open = false
        given(HOLDS, asked("r-admin"), true)
        await render()
        await until(() => button("Cancel — it wasn't me") !== undefined)
        await press(button("Cancel — it wasn't me"))
        await until(() => (dialog()?.textContent ?? "").includes("As an admin of idp.test, you get no reset link: change your password where the instance is run."))
    })

    it("“It's me” points to the code on the asking device; OK puts it off", async () => {
        given(HOLDS, asked("r-me"))
        await render()
        await until(() => button("It's me — approve with a code instead") !== undefined)

        await press(button("It's me — approve with a code instead"))
        await until(() => dialog()?.getAttribute("aria-label") === "Approve it with a code")
        expect(dialog()?.textContent).toContain(
            `On Chrome on Windows, choose "Approve with another device instead" under its request — or "It was me", if it shows a banner. It shows a 6-digit code: type it here when Pīna'i asks for it. That keeps your history, and ends the request.`,
        )
        expect(wired.end).not.toHaveBeenCalled()
        await press(button("OK"))
        await until(() => dialog() === null)
    })

    it("“Not now” puts it off for this page load; a new push for it brings it back", async () => {
        given(HOLDS, asked("r-later"))
        await render()
        await until(() => button("Not now") !== undefined)

        await press(button("Not now"))
        await until(() => dialog() === null)
        expect(wired.end).not.toHaveBeenCalled()

        await push({ type: "start_over_requested", data: { request_id: "r-later", device_id: THEM, display_name: "Chrome on Windows", ready_at: "2026-11-16T10:00:00Z" } })
        await until(() => dialog() !== null)
    })

    it("closes as the request ends elsewhere", async () => {
        given(HOLDS, asked("r-gone"))
        await render()
        await until(() => dialog() !== null)

        wired.request = null
        await push({ type: "start_over_cancelled", data: { request_id: "r-gone", reason: "approved" } })
        await until(() => dialog() === null)
    })
})
