/**
 * Settings → Instance's screen logic, rendered without a DOM to look at: the hook in a memory
 * router and a query client, the admin API stubbed. A revoked invitation leaves the list at once;
 * one row's request never busies another; a 403 says the account is no admin any more; a reset
 * refused for an old password asks it again.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { act, createElement, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"
import type { InstanceMember, OpenInvitation } from "@pinai/domain/models/instance-admin"
import {
    type InstanceEditorViewModel,
    useInstanceEditorViewModel,
} from "@/presentation/pages/home/SettingsModal/InstanceEditor/InstanceEditor.viewmodel"
import { useAppStore } from "@/store/store"

const port = vi.hoisted(() => ({
    listMembers: vi.fn(),
    listInvitations: vi.fn(),
    createInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    issuePasswordReset: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("@/ioc", () => ({ getInstanceAdminPort: () => port, getAuthPort: vi.fn(), getAuthPlatform: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const IDP = "http://localhost:8097"
const MIKA: InstanceMember = { id: "m1", display_name: "Mika", admin: false, last_active_at: null, online: true }
const invitation = (id: string): OpenInvitation => ({
    id,
    created_at: "2026-10-27T10:00:00Z",
    expires_at: "2026-11-03T10:00:00Z",
    created_by: { display_name: "Hōkū" },
})
const LINK = { id: "i9", link: `${IDP}/i/TOKEN`, expires_at: "2026-11-03T12:00:00Z" }
const never = () => new Promise<never>(() => undefined)

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
}

let vm!: InstanceEditorViewModel
let root: Root

const report = (rendered: InstanceEditorViewModel) => {
    vm = rendered
}

function Probe() {
    const rendered = useInstanceEditorViewModel()
    useEffect(() => report(rendered))
    return null
}

async function tick() {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
    })
}

async function until(check: () => boolean) {
    for (let i = 0; i < 100 && !check(); i++) await tick()
    expect(check()).toBe(true)
}

async function mount() {
    const router = createRouter({
        routeTree: createRootRoute({ component: Probe }),
        history: createMemoryHistory({ initialEntries: ["/home"] }),
    })
    root = createRoot(document.createElement("div"))
    await act(async () => {
        root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RouterProvider, { router })))
    })
    await until(() => vm?.members !== undefined && vm.invitations !== undefined)
}

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.resetAllMocks()
    useAppStore.setState({ idpUrl: IDP, accessToken: "tok" })
    port.listMembers.mockResolvedValue([MIKA])
    // The first read answers; a read after a change stays out, so what the screen shows is its own doing.
    port.listInvitations.mockResolvedValueOnce([invitation("i1"), invitation("i2")]).mockImplementation(never)
})

afterEach(() => act(() => root.unmount()))

describe("revoking an invitation", () => {
    it("takes it off the list at once, before the list is read again", async () => {
        await mount()
        port.revokeInvitation.mockResolvedValue(undefined)

        let gone = false
        await act(async () => {
            gone = await vm.revoke("i1")
        })

        expect(gone).toBe(true)
        expect(vm.invitations?.map((i) => i.id)).toEqual(["i2"])
        expect(toast.success).toHaveBeenCalledWith("Invitation revoked")
        expect(port.listInvitations).toHaveBeenCalledTimes(2)
    })

    it("takes one the IdP no longer has (404) off the list too, with no error", async () => {
        await mount()
        port.revokeInvitation.mockRejectedValue(new IdpError(404, "not_found", "Invitation not found"))

        await act(async () => {
            expect(await vm.revoke("i1")).toBe(true)
        })

        expect(vm.invitations?.map((i) => i.id)).toEqual(["i2"])
        expect(toast.error).not.toHaveBeenCalled()
    })

    it("keeps a row it couldn't revoke, live again, and says why", async () => {
        await mount()
        port.revokeInvitation.mockRejectedValue(new Error("Request timed out"))

        await act(async () => {
            expect(await vm.revoke("i1")).toBe(false)
        })

        expect(vm.invitations?.map((i) => i.id)).toEqual(["i1", "i2"])
        expect(vm.isRevoking("i1")).toBe(false)
        expect(toast.error).toHaveBeenCalledWith("Request timed out")
    })

    it("leaves another revoke in flight busy when one ends", async () => {
        await mount()
        const first = deferred<void>()
        port.revokeInvitation.mockImplementation((_idp, _token, id: string) => (id === "i1" ? first.promise : never()))

        let revoking: Promise<boolean> = Promise.resolve(false)
        await act(async () => {
            revoking = vm.revoke("i1")
            void vm.revoke("i2")
        })
        expect([vm.isRevoking("i1"), vm.isRevoking("i2")]).toEqual([true, true])

        await act(async () => {
            first.resolve()
            await revoking
        })
        expect([vm.isRevoking("i1"), vm.isRevoking("i2")]).toEqual([false, true])
    })
})

describe("making a link", () => {
    it("shows the invitation's link and frees its row without waiting for the list", async () => {
        await mount()
        port.createInvitation.mockResolvedValue(LINK)
        await act(async () => vm.toggle({ kind: "invite" }))

        await act(async () => {
            await vm.createInvitation()
        })

        expect(vm.roster.issued).toEqual({ link: LINK.link, expires_at: LINK.expires_at })
        expect(vm.isIssuing({ kind: "invite" })).toBe(false)
    })

    it("busies only the row whose link is being made", async () => {
        await mount()
        port.issuePasswordReset.mockImplementation(never)
        await act(async () => vm.toggle({ kind: "reset", memberId: "m1" }))

        await act(async () => {
            void vm.issueReset(vm.members![0])
        })

        expect(vm.isIssuing({ kind: "reset", memberId: "m1" })).toBe(true)
        expect(vm.isIssuing({ kind: "reset", memberId: "m2" })).toBe(false)
        expect(vm.isIssuing({ kind: "invite" })).toBe(false)
    })

    it("keeps a row busy while its link is awaited, whatever other row is opened meanwhile", async () => {
        await mount()
        port.createInvitation.mockImplementation(never)
        port.issuePasswordReset.mockImplementation(never)

        await act(async () => vm.toggle({ kind: "invite" }))
        await act(async () => void vm.createInvitation())
        await act(async () => vm.toggle({ kind: "reset", memberId: "m1" }))
        await act(async () => void vm.issueReset(vm.members![0]))
        await act(async () => vm.toggle({ kind: "invite" }))

        expect(vm.isIssuing({ kind: "invite" })).toBe(true)
        expect(vm.isIssuing({ kind: "reset", memberId: "m1" })).toBe(true)
        expect(port.createInvitation).toHaveBeenCalledOnce()
    })

    it("asks the password again when the IdP refuses a reset link for an old one", async () => {
        await mount()
        port.issuePasswordReset.mockRejectedValue(new IdpError(401, "insufficient_user_authentication", "Sign in again"))

        await act(async () => {
            await vm.issueReset(vm.members![0])
        })

        expect(vm.recentSignIn.asking).toBe("make a reset link for Mika")
        expect(toast.error).not.toHaveBeenCalled()
    })
})

describe("an account no longer admin", () => {
    it("is told so when the IdP refuses an action with 403, and gets no error toast", async () => {
        await mount()
        port.createInvitation.mockRejectedValue(new IdpError(403, "access_denied", "Only an admin may do this"))

        await act(async () => {
            await vm.createInvitation()
        })

        expect(vm.noLongerAdmin).toBe(true)
        expect(toast.error).not.toHaveBeenCalled()
    })

    it("is told so when the lists are refused, without retrying them", async () => {
        port.listMembers.mockRejectedValue(new IdpError(403, "access_denied", "Only an admin may do this"))
        port.listInvitations.mockReset().mockRejectedValue(new IdpError(403, "access_denied", "Only an admin may do this"))
        const router = createRouter({
            routeTree: createRootRoute({ component: Probe }),
            history: createMemoryHistory({ initialEntries: ["/home"] }),
        })
        root = createRoot(document.createElement("div"))
        await act(async () => {
            root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RouterProvider, { router })))
        })

        await until(() => vm?.noLongerAdmin === true)
        expect(vm.loadFailed).toBe(false)
        expect(port.listMembers).toHaveBeenCalledOnce()
    })
})
