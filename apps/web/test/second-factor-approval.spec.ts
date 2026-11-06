/**
 * Turning the second factor on takes a device approved under the account's history key
 * (`identity-provider/specs/auth.md § 3`): a device that isn't is told why instead of being offered
 * it, the IdP's refusal (`403 approval_required`) on either step is told the same way, and turning
 * it off is unchanged.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router"
import { act, createElement, type FunctionComponent } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Admission } from "@pinai/domain/models/admission"
import type { UserProfile } from "@pinai/domain/models/auth"
import type { HistoryKeyStanding } from "@pinai/domain/models/history-key"
import { IdpError } from "@pinai/domain/models/idp-error"
import { SecurityEditor } from "@/presentation/pages/home/SettingsModal/SecurityEditor/SecurityEditor"
import { TotpEnrollPage } from "@/presentation/pages/totp-enroll/TotpEnrollPage"
import { useAppStore } from "@/store/store"

const wired = vi.hoisted(() => ({
    standing: null as unknown,
    admission: null as unknown,
    start: null as unknown as ReturnType<typeof vi.fn>,
    verify: null as unknown as ReturnType<typeof vi.fn>,
}))
vi.mock("@/ioc", () => ({
    getE2eePort: () => ({
        historyKeyStanding: async () =>
            wired.standing instanceof Error ? Promise.reject(wired.standing) : wired.standing === "reading" ? new Promise(() => undefined) : wired.standing,
        recordedAdmission: async () => wired.admission,
    }),
    getTotpPort: () => ({ startEnrollment: wired.start, verifyEnrollment: wired.verify }),
    getAuthPort: vi.fn(),
    getAuthPlatform: vi.fn(),
}))

const HOLDS: HistoryKeyStanding = { kind: "holds", generation: 1, settled: true }
const RESET: HistoryKeyStanding = { kind: "mismatch", generation: 2, setByDevice: "other", reason: "check-value", held: 1 }
const KEPT: Admission = { kind: "in", by: "kept-words", cause: "reset-by-unapproved" }
const REFUSED = () => new IdpError(403, "approval_required", "This takes a device approved under the current history key")
const EXPLAINED = "Only one of your approved devices can turn two-factor authentication on."

let root: Root | null = null
let container: HTMLElement

async function render(page: FunctionComponent): Promise<void> {
    const router = createRouter({ routeTree: createRootRoute({ component: page }), history: createMemoryHistory({ initialEntries: ["/"] }) })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root?.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RouterProvider, { router })))
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

const text = () => container.textContent ?? ""
const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)

function given(standing: HistoryKeyStanding | Error | "reading", admission: Admission | null, totpEnabled = false) {
    wired.standing = standing
    wired.admission = admission
    wired.start = vi.fn(async () => ({ secret_base32: "JBSWY3DPEHPK3PXP", provisioning_url: "otpauth://totp/Pina'i:alice?secret=JBSWY3DPEHPK3PXP" }))
    wired.verify = vi.fn(async () => ({ recovery_codes: [] }))
    useAppStore.setState({
        idpUrl: "https://idp.test",
        accessToken: "tok",
        user: { actor_uri: "https://idp.test/users/alice", email: "alice@idp.test", totp_enabled: totpEnabled } as UserProfile,
    })
}

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
})

afterEach(async () => {
    if (root) {
        const leaving = root
        root = null
        await act(async () => leaving.unmount())
        container.remove()
    }
    vi.useRealTimers()
})

describe("turning the second factor on", () => {
    it("on a device not approved, with a history key: told why, and no enrolment starts", async () => {
        given(RESET, KEPT)
        await render(TotpEnrollPage)
        await until(() => text().includes(EXPLAINED))
        expect(text()).toContain("This device isn't approved: once one of your devices approves it, you can turn it on here.")
        expect(text()).toContain("Not from this device")
        expect(text()).not.toContain("Scan and verify")
        expect(text()).not.toContain("scan the QR code")
        expect(wired.start).not.toHaveBeenCalled()
        expect(container.querySelector('[aria-label="Authenticator QR code"]')).toBeNull()
    })

    it("on an approved device, or before any history key, the enrolment starts", async () => {
        given(HOLDS, { kind: "in", by: "passphrase" })
        await render(TotpEnrollPage)
        await until(() => container.querySelector('[aria-label="Authenticator QR code"]') !== null)
        expect(wired.start).toHaveBeenCalledOnce()
        await act(async () => root?.unmount())
        root = null

        given({ kind: "no-key" }, null)
        await render(TotpEnrollPage)
        await until(() => wired.start.mock.calls.length === 1)
        expect(text()).not.toContain(EXPLAINED)
    })

    it("a check that can't be read lets the IdP decide: the enrolment starts", async () => {
        given(new Error("unreadable"), null)
        await render(TotpEnrollPage)
        await until(() => wired.start.mock.calls.length === 1)
        expect(text()).not.toContain(EXPLAINED)
    })

    it("tells the IdP's refusal of the start the same way", async () => {
        given(HOLDS, { kind: "in", by: "passphrase" })
        wired.start.mockRejectedValueOnce(REFUSED())
        await render(TotpEnrollPage)
        await until(() => text().includes(EXPLAINED))
        expect(text()).not.toContain("This takes a device approved")
    })

    it("tells the IdP's refusal of the first code the same way, the code's screen gone", async () => {
        given(HOLDS, { kind: "in", by: "passphrase" })
        wired.verify.mockRejectedValueOnce(REFUSED())
        await render(TotpEnrollPage)
        await until(() => container.querySelector('[aria-label="Authenticator QR code"]') !== null)

        const input = container.querySelector<HTMLInputElement>("input")!
        await act(async () => {
            const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
            setValue.call(input, "123456")
            input.dispatchEvent(new Event("input", { bubbles: true }))
        })
        await until(() => wired.verify.mock.calls.length === 1)
        await until(() => text().includes(EXPLAINED))
        expect(container.querySelector('[aria-label="Authenticator QR code"]')).toBeNull()
    })

    it("in Settings → Security: explains instead of offering it on a device not approved; turning it off stays", async () => {
        given(RESET, KEPT)
        await render(SecurityEditor)
        await until(() => text().includes(EXPLAINED))
        expect(button("Enable 2FA")).toBeUndefined()
        await act(async () => root?.unmount())
        root = null

        given(RESET, KEPT, true)
        await render(SecurityEditor)
        await until(() => button("Disable 2FA") !== undefined)
        expect(text()).not.toContain(EXPLAINED)
        await act(async () => root?.unmount())
        root = null

        given(HOLDS, { kind: "in", by: "partner", partner: "laptop" })
        await render(SecurityEditor)
        await until(() => button("Enable 2FA") !== undefined)
        expect(text()).not.toContain(EXPLAINED)
    })

    it("in Settings → Security: offers nothing while the check reads, never flashing “Enable 2FA”", async () => {
        given("reading", null)
        await render(SecurityEditor)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(500)
        })
        expect(button("Enable 2FA")).toBeUndefined()
        expect(text()).not.toContain(EXPLAINED)
        expect(text()).toContain("2FA · off")
    })
})
