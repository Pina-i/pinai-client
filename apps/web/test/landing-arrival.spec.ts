/**
 * Arriving on the landing with `?instance=`, through the landing's real `beforeLoad` in a memory
 * router: filled in when signed in nowhere; another instance's session dropped first; on to the
 * app for the instance already signed in to; and an arrival reached while the landing is up taken
 * too, the URL's cleanup never cancelling the load that decides it; and, short of an arrival, the
 * last address submitted, remembered on Continue.
 */
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { act, createElement, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Route as LandingRoute } from "@/routes/index"
import { useLandingPageViewModel } from "@/presentation/pages/landing/LandingPage.viewmodel"
import { useAppStore } from "@/store/store"

const auth = vi.hoisted(() => ({
    tokens: { set: vi.fn(), take: vi.fn(() => null), clear: vi.fn() },
}))
const last = vi.hoisted(() => ({ stored: null as string | null, write: vi.fn() }))
vi.mock("@/ioc/index", () => {
    const pinai = (name: string) => ({ software: { name: "pinai" }, openRegistrations: false, metadata: { nodeName: name } })
    return {
        getAuthPlatform: () => ({ browserSession: true, tokens: auth.tokens }),
        getAuthPort: () => ({}),
        getSessionRenewal: () => async () => ({ kind: "ended" }),
        getAccountStoragePort: () => ({}),
        getLastInstancePort: () => ({ read: () => last.stored, write: last.write }),
        getRecentInstancesPort: () => ({ read: () => [], write: vi.fn() }),
        getNodeInfoPort: () => ({
            links: async (origin: string) => ({
                links: [{ rel: "http://nodeinfo.diaspora.software/ns/schema/2.1", href: `${origin}/nodeinfo/2.1` }],
            }),
            document: async (href: string) => pinai(new URL(href).host),
        }),
    }
})

type Landing = ReturnType<typeof useLandingPageViewModel>
let vm!: Landing
let root: Root
let router: ReturnType<typeof createRouter>

const report = (rendered: Landing) => {
    vm = rendered
}

function Probe() {
    const rendered = useLandingPageViewModel()
    useEffect(() => report(rendered))
    return null
}

async function tick() {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
    })
}

async function until(check: () => boolean) {
    for (let i = 0; i < 100 && !check(); i++) await tick()
    expect(check()).toBe(true)
}

async function arrive(href: string) {
    const rootRoute = createRootRoute()
    const landing = createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        beforeLoad: LandingRoute.options.beforeLoad,
        component: Probe,
    })
    const home = createRoute({ getParentRoute: () => rootRoute, path: "/home", component: () => null })
    router = createRouter({
        routeTree: rootRoute.addChildren([landing, home]),
        history: createMemoryHistory({ initialEntries: [href] }),
    })
    root = createRoot(document.createElement("div"))
    await act(async () => {
        root.render(createElement(RouterProvider, { router }))
    })
}

const at = () => router.state.location.pathname + router.state.location.searchStr

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    localStorage.clear()
    last.stored = null
    // A test waiting for the landing's first render must not see the last test's.
    vm = undefined as unknown as Landing
    useAppStore.setState({ accessToken: null, user: null, idpUrl: null })
})

afterEach(() => {
    vi.unstubAllGlobals()
    return act(() => root.unmount())
})

describe("arriving on the landing with ?instance=", () => {
    it("fills the instance in when signed in nowhere, then drops the parameter", async () => {
        await arrive("/?instance=aotearoa.nz")

        await until(() => vm?.input === "aotearoa.nz" && vm.resolvedHost === "aotearoa.nz")
        expect(vm.arrivalFocus).toBe("continue")
        await until(() => at() === "/")
        expect(auth.tokens.clear).not.toHaveBeenCalled()
    })

    it("drops another instance's session, on this device only, then fills the new one in", async () => {
        localStorage.setItem("idp_url", "https://reef.chat")
        useAppStore.setState({ idpUrl: "https://reef.chat" })

        await arrive("/?instance=aotearoa.nz")

        await until(() => vm?.input === "aotearoa.nz")
        expect(useAppStore.getState().idpUrl).toBeNull()
        expect(localStorage.getItem("idp_url")).toBeNull()
        expect(auth.tokens.clear).toHaveBeenCalledOnce()
    })

    it("goes on to the app for the instance it signs in to already, whatever the scheme", async () => {
        useAppStore.setState({ idpUrl: "https://aotearoa.nz" })

        await arrive("/?instance=http://aotearoa.nz")

        await until(() => router.state.location.pathname === "/home")
        expect(useAppStore.getState().idpUrl).toBe("https://aotearoa.nz")
    })

    it("takes an arrival reached while the landing is up", async () => {
        await arrive("/")
        await until(() => vm !== undefined && vm.input === "")

        await act(async () => {
            await router.navigate({ href: "/?instance=kauai.studio" })
        })

        await until(() => vm.input === "kauai.studio" && vm.resolvedHost === "kauai.studio")
        expect(vm.arrivalFocus).toBe("continue")
    })

    it("lets an arrival win over the last address", async () => {
        last.stored = "https://reef.chat"

        await arrive("/?instance=aotearoa.nz")

        await until(() => vm?.input === "aotearoa.nz")
    })

    it("never cancels the load deciding an arrival with the URL's cleanup", async () => {
        await arrive("/?instance=aotearoa.nz")
        await until(() => vm?.input === "aotearoa.nz" && at() === "/")

        await act(async () => {
            await router.navigate({ href: "/?instance=kauai.studio" })
        })

        await until(() => at() === "/")
        await until(() => vm.input === "kauai.studio")
    })
})

describe("the landing's starting address", () => {
    it("starts with the last address submitted", async () => {
        last.stored = "https://reef.chat"

        await arrive("/")

        await until(() => vm?.input === "reef.chat")
    })

    it("starts empty when none was submitted", async () => {
        await arrive("/")

        await until(() => vm !== undefined)
        expect(vm.input).toBe("")
    })

    it("remembers the address Continue goes to, before the sign-in starts", async () => {
        await arrive("/?instance=aotearoa.nz")
        await until(() => vm?.resolvedHost === "aotearoa.nz")
        vi.stubGlobal("matchMedia", () => ({ matches: true }))

        await act(async () => {
            await vm.continueToInstance()
        })

        expect(last.write).toHaveBeenCalledWith("https://aotearoa.nz")
    })
})
