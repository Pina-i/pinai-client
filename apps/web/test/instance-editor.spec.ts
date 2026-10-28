/**
 * Settings → Instance's screen logic, mostly rendered without a DOM to look at: the hook in a
 * memory router and a query client, the admin API stubbed. An open instance gets the name and
 * description and no roster; Save waits for a change within the limits, sends the trimmed text
 * and shows the answer, keeps what is typed meanwhile, and a failed save keeps the draft; no read
 * from before a save answers over it; a revoked invitation leaves the list at once; one row's
 * request never busies another; a 403 says the account is no admin any more; a reset refused for
 * an old password asks it again.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { act, createElement, type FunctionComponent, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { IdpError } from "@pinai/domain/models/idp-error"
import type { InstanceInfo } from "@pinai/domain/models/instance"
import type { InstanceIntro, InstanceMember, OpenInvitation } from "@pinai/domain/models/instance-admin"
import { InstanceEditor } from "@/presentation/pages/home/SettingsModal/InstanceEditor/InstanceEditor"
import {
    type InstanceEditorViewModel,
    useInstanceEditorViewModel,
} from "@/presentation/pages/home/SettingsModal/InstanceEditor/InstanceEditor.viewmodel"
import { useAppStore } from "@/store/store"

const port = vi.hoisted(() => ({
    getIntro: vi.fn(),
    saveIntro: vi.fn(),
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
const HOST = "localhost:8097"
const INVITE_ONLY: InstanceInfo = { name: "Aotearoa", users: 9, openRegistrations: false }
const OPEN: InstanceInfo = { ...INVITE_ONLY, openRegistrations: true }
const SAVED: InstanceIntro = { name: null, description: "Where the long white cloud gathers." }
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
let info: InstanceInfo

const report = (rendered: InstanceEditorViewModel) => {
    vm = rendered
}

function Probe() {
    const rendered = useInstanceEditorViewModel(HOST, info)
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

async function render(component: FunctionComponent): Promise<HTMLElement> {
    const router = createRouter({
        routeTree: createRootRoute({ component }),
        history: createMemoryHistory({ initialEntries: ["/home"] }),
    })
    const container = document.createElement("div")
    root = createRoot(container)
    await act(async () => {
        root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RouterProvider, { router })))
    })
    return container
}

async function mount() {
    await render(Probe)
    await until(() => vm?.members !== undefined && vm.invitations !== undefined)
}

async function mountIntro() {
    await render(Probe)
    await until(() => vm?.intro.saved !== undefined)
}

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.resetAllMocks()
    vm = undefined!
    useAppStore.setState({ idpUrl: IDP, accessToken: "tok" })
    info = INVITE_ONLY
    port.getIntro.mockResolvedValue(SAVED)
    port.listMembers.mockResolvedValue([MIKA])
    // The first read answers; a read after a change stays out, so what the screen shows is its own doing.
    port.listInvitations.mockResolvedValueOnce([invitation("i1"), invitation("i2")]).mockImplementation(never)
})

afterEach(() => act(() => root.unmount()))

describe("the panel", () => {
    const editor = () => createElement(InstanceEditor, { host: HOST, info })
    const headings = (page: HTMLElement) => [...page.querySelectorAll("h2, h3")].map((h) => h.textContent)

    it("on an open instance, holds the name and description and no People", async () => {
        info = OPEN
        const page = await render(editor)
        await until(() => page.querySelector("textarea") !== null)

        expect(headings(page)).toEqual(["Open to anyone."])
        expect(page.querySelector("input")?.placeholder).toBe(HOST)
        expect(page.querySelector("textarea")?.value).toBe(SAVED.description)
        expect(page.textContent).toContain("people reset their own passwords from the sign-in page")
        expect(page.querySelector('[aria-label="Members"]')).toBeNull()
        expect(port.listMembers).not.toHaveBeenCalled()
        expect(port.listInvitations).not.toHaveBeenCalled()
    })

    it("on an invite-only instance, holds them above People", async () => {
        const page = await render(editor)
        await until(() => page.querySelector("textarea") !== null && page.querySelector('[aria-label="Members"]') !== null)

        expect(headings(page)).toEqual(["Just you, and room for more.", "People"])
        const people = [...page.querySelectorAll("h3")].find((h) => h.textContent === "People")!
        expect(page.querySelector("textarea")!.compareDocumentPosition(people) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(page.textContent).not.toContain("registration is open")
    })
})

describe("the name and description", () => {
    it("can be saved only once changed, and within the limits", async () => {
        await mountIntro()
        expect(vm.intro).toMatchObject({ name: "", description: SAVED.description, canSave: false, canCancel: false })

        await act(async () => vm.intro.setDescription(`${SAVED.description}  `))
        expect([vm.intro.canSave, vm.intro.canCancel]).toEqual([false, true])

        await act(async () => vm.intro.setName("🌺".repeat(40)))
        expect(vm.intro.canSave).toBe(true)

        expect(vm.intro.limitNotice).toBe("")

        await act(async () => vm.intro.setName("ō".repeat(41)))
        expect([vm.intro.isOver("name"), vm.intro.canSave]).toEqual([true, false])
        expect(vm.intro.limitNotice).toBe("Name: 41 of 40 characters")

        await act(async () => vm.intro.setName("Aotearoa"))
        await act(async () => vm.intro.setDescription("ō".repeat(91)))
        expect([vm.intro.isOver("description"), vm.intro.length.description, vm.intro.canSave]).toEqual([true, 91, false])
        expect(vm.intro.limitNotice).toBe("Description: 91 of 90 characters")

        await act(async () => vm.intro.cancel())
        expect(vm.intro).toMatchObject({ name: "", description: SAVED.description, canSave: false, canCancel: false })
    })

    it("previews the sign-in page as it is typed", async () => {
        await mountIntro()
        expect(vm.intro.preview).toEqual({
            host: HOST,
            headline: SAVED.description,
            defaultHeadline: false,
            people: "9 people",
            open: false,
            signIn: `Sign in to ${HOST}`,
        })

        await act(async () => vm.intro.setName(" Aotearoa "))
        await act(async () => vm.intro.setDescription(""))
        expect(vm.intro.preview).toMatchObject({
            headline: "An identity provider.",
            defaultHeadline: true,
            signIn: "Sign in to Aotearoa",
        })
    })

    it("sends the trimmed text, a blank field as the default, and shows what the IdP saved", async () => {
        await mountIntro()
        port.saveIntro.mockResolvedValue({ name: "Aotearoa", description: null })
        await act(async () => vm.intro.setName("  Aotearoa  "))
        await act(async () => vm.intro.setDescription("   "))

        await act(async () => {
            await vm.intro.save()
        })

        expect(port.saveIntro).toHaveBeenCalledWith(IDP, "tok", { name: "Aotearoa", description: null })
        expect(vm.intro).toMatchObject({
            saved: { name: "Aotearoa", description: null },
            name: "Aotearoa",
            description: "",
            canSave: false,
            canCancel: false,
            isSaving: false,
        })
        expect(port.getIntro).toHaveBeenCalledOnce()
    })

    it("keeps what is typed while a save is out, over the text the IdP saved", async () => {
        await mountIntro()
        const answer = deferred<InstanceIntro>()
        port.saveIntro.mockReturnValue(answer.promise)
        await act(async () => vm.intro.setName("Aotearoa"))

        let saving: Promise<void> = Promise.resolve()
        await act(async () => {
            saving = vm.intro.save()
        })
        await until(() => vm.intro.isSaving)
        expect([vm.intro.canSave, vm.intro.canCancel]).toEqual([true, false])

        await act(async () => vm.intro.setName("Aotearoa 2"))
        await act(async () => {
            answer.resolve({ name: "Aotearoa", description: SAVED.description })
            await saving
        })
        await until(() => !vm.intro.isSaving)

        expect(vm.intro).toMatchObject({
            saved: { name: "Aotearoa", description: SAVED.description },
            name: "Aotearoa 2",
            canSave: true,
        })
    })

    it("lets no read from before a save answer over the text saved", async () => {
        await mountIntro()
        const stale = deferred<InstanceIntro>()
        port.getIntro.mockReturnValue(stale.promise)
        port.saveIntro.mockResolvedValue({ name: "Aotearoa", description: SAVED.description })
        // A read in flight, as a refocused window starts one.
        await act(async () => vm.intro.retry())
        await act(async () => vm.intro.setName("Aotearoa"))

        await act(async () => {
            await vm.intro.save()
        })
        await act(async () => stale.resolve(SAVED))
        await tick()

        expect(vm.intro.saved).toEqual({ name: "Aotearoa", description: SAVED.description })
        expect(vm.intro.name).toBe("Aotearoa")
    })

    it("keeps a draft it couldn't save, and says why", async () => {
        await mountIntro()
        port.saveIntro.mockRejectedValue(new IdpError(500, "server_error", "internal error"))
        await act(async () => vm.intro.setName("  Aotearoa  "))

        await act(async () => {
            await vm.intro.save()
        })
        await tick()

        expect(vm.intro).toMatchObject({ saved: SAVED, name: "  Aotearoa  ", canSave: true, isSaving: false })
        expect(toast.error).toHaveBeenCalledWith("internal error")
    })

    it("tells an account refused 403 on a save that it is no admin any more, with no error toast", async () => {
        await mountIntro()
        port.saveIntro.mockRejectedValue(new IdpError(403, "access_denied", "Only an admin may do this"))
        await act(async () => vm.intro.setName("Aotearoa"))

        await act(async () => {
            await vm.intro.save()
        })

        await until(() => vm.noLongerAdmin)
        expect(toast.error).not.toHaveBeenCalled()
    })

    it("tells an account refused 403 on reading them that it is no admin any more, without retrying", async () => {
        info = OPEN
        port.getIntro.mockRejectedValue(new IdpError(403, "access_denied", "Only an admin may do this"))
        await render(Probe)

        await until(() => vm?.noLongerAdmin === true)
        expect(vm.intro.loadFailed).toBe(false)
        expect(port.getIntro).toHaveBeenCalledOnce()
    })
})

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
        await render(Probe)

        await until(() => vm?.noLongerAdmin === true)
        expect(vm.loadFailed).toBe(false)
        expect(port.listMembers).toHaveBeenCalledOnce()
    })
})
