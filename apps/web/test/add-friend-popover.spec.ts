/**
 * "Add a friend": the intro, the search by name and its sections, the lookup by address, Add and
 * Accept, the timing, and Escape.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AddressLookup, GroupPerson, PeopleFound, Person, Relation } from "@pinai/domain/models/people-search"

const mocks = vi.hoisted(() => ({
    searchPeople: vi.fn(),
    lookupAddress: vi.fn(),
    sendFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    toastError: vi.fn(),
    dismissNotification: vi.fn(),
}))
vi.mock("@/ioc/index", () => ({
    getSocialPort: () => ({
        searchPeople: mocks.searchPeople,
        lookupAddress: mocks.lookupAddress,
        sendFriendRequest: mocks.sendFriendRequest,
        acceptFriendRequest: mocks.acceptFriendRequest,
    }),
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))
vi.mock("@/store/store", async () => {
    const { create } = await import("zustand")
    return {
        useAppStore: create(() => ({
            accessToken: "access-1",
            idpUrl: "https://idp.test",
            user: { address: "hoku_xk9mp@aotearoa.nz", actor_uri: "https://aotearoa.nz/users/hoku_xk9mp" },
            dismissNotification: mocks.dismissNotification,
        })),
    }
})

const { AddFriendPopover } = await import("@/presentation/pages/home/FriendsPanel/AddFriendPopover/AddFriendPopover")
const { friendsQueryKey } = await import("@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel")
const { dmConversationsQueryKey } = await import("@/presentation/hooks/useLoadDmConversations")
const { peopleQueryKey } = await import("@/presentation/pages/home/FriendsPanel/AddFriendPopover/people-query-keys")
const { COPIED_FOR_MS } = await import("@/presentation/pages/home/FriendsPanel/AddFriendPopover/AddFriendPopover.viewmodel")

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const IDP = "https://idp.test"

let root: Root | null = null
let client: QueryClient

beforeEach(() => {
    vi.useFakeTimers()
    // jsdom has no `CSS.escape`, which React Aria's popover reads.
    if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ""
    vi.useRealTimers()
    for (const mock of Object.values(mocks)) mock.mockReset()
    delete (navigator as { clipboard?: unknown }).clipboard
})

function person(handle: string, name: string | null, relation: Relation = "none", extra: Partial<Person> = {}): Person {
    return {
        actor_uri: `https://aotearoa.nz/users/${handle}`,
        address: `${handle}@aotearoa.nz`,
        display_name: name,
        avatar_url: null,
        relation,
        friendship_id: null,
        ...extra,
    }
}

function remote(handle: string, host: string, name: string, group: string | null): GroupPerson {
    return { ...person(handle, name), actor_uri: `https://${host}/users/${handle}`, address: `${handle}@${host}`, group }
}

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

async function wait(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
    })
}

async function open() {
    client = new QueryClient()
    vi.spyOn(client, "invalidateQueries")
    const container = document.createElement("div")
    document.body.appendChild(container)
    await act(async () => {
        root = createRoot(container)
        root.render(createElement(QueryClientProvider, { client }, createElement(AddFriendPopover)))
    })
    await act(async () => button("Add friend").click())
}

const text = () => document.body.textContent ?? ""
const dialog = () => document.body.querySelector('[role="dialog"]')
const input = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Name or full address"]')!
const status = () => document.body.querySelector('[role="status"]')?.textContent
const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>("button")]
const button = (name: string) => buttons().find((b) => b.getAttribute("aria-label") === name || b.textContent === name)!
const row = (name: string) => [...document.body.querySelectorAll("li")].find((li) => li.textContent?.includes(name))!
const occurrences = (needle: string) => text().split(needle).length - 1

async function type(value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    await act(async () => {
        setValue.call(input(), value)
        input().dispatchEvent(new Event("input", { bubbles: true }))
    })
}

async function press(key: string, target: Element = input()) {
    await act(async () => {
        target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
    })
}

const skeletons = () => document.body.querySelectorAll('span.bg-surf3[aria-hidden="true"]').length

async function click(name: string) {
    await act(async () => button(name).click())
}

/** Types a name and lets the search answer `found`, the refetch after an Add or Accept too. */
async function search(query: string, found: PeopleFound) {
    mocks.searchPeople.mockResolvedValue(found)
    await type(query)
    await wait(300)
    await wait(0)
}

describe("AddFriendPopover", () => {
    it("shows the two ways to search until two characters, and asks nothing", async () => {
        await open()

        expect(text()).toContain("Add a friend · searching outward from you")
        expect(text()).toContain("By name")
        expect(text()).toContain("Anyone on aotearoa.nz, and people from your groups. Accents don't matter.")
        expect(text()).toContain("By full address")
        expect(status()).toBe("Search names on your server and in your groups, or paste a full address")
        expect(text()).toContain("Your full address — friends on other servers need it")
        expect(text()).toContain("hoku_xk9mp@aotearoa.nz")

        await type("k")
        await wait(1000)

        expect(status()).toBe("One more letter…")
        expect(text()).toContain("By name")
        expect(mocks.searchPeople).not.toHaveBeenCalled()
    })

    it("searches names 300 ms after the last keystroke, the sections loading meanwhile", async () => {
        mocks.searchPeople.mockResolvedValue({ server: [], groups: [] })
        await open()

        await type("ma")
        await wait(200)
        await type("mah")
        await wait(299)

        expect(mocks.searchPeople).not.toHaveBeenCalled()
        expect(status()).toBe("Searching…")
        expect(text()).toContain("Your server")
        expect(text()).toContain("Your groups")
        expect(text()).toContain("Everywhere else")
        expect(document.body.querySelector("li")).toBeNull()
        // Two skeleton rows in each name section, four shapes each.
        expect(skeletons()).toBe(16)

        await wait(1)
        expect(mocks.searchPeople).toHaveBeenCalledOnce()
        expect(mocks.searchPeople).toHaveBeenCalledWith(IDP, "access-1", "mah")
        await wait(0)
        expect(skeletons()).toBe(0)
    })

    it("lights the field while it has focus, and while it holds more than spaces", async () => {
        await open()
        const field = () => input().parentElement!
        await wait(50)

        expect(document.activeElement).toBe(input())
        expect(field().className).toContain("focus-within:border-acc")
        await type("   ")
        expect(field().classList.contains("border-acc")).toBe(false)
        await type(" k")
        expect(field().classList.contains("border-acc")).toBe(true)
    })

    it("clears the field with its Clear button, back to the two ways to search", async () => {
        await open()
        await type("kai")

        await click("Clear")

        expect(input().value).toBe("")
        expect(text()).toContain("By full address")
        expect(button("Clear")).toBeUndefined()
    })

    it("shows a search that failed as loading while it is asked again, never the old failure", async () => {
        const again = deferred<PeopleFound>()
        mocks.searchPeople
            .mockRejectedValueOnce(new Error("Service unavailable"))
            .mockResolvedValueOnce({ server: [], groups: [] })
            .mockReturnValueOnce(again.promise)
        await open()
        await type("ka")
        await wait(300)
        await wait(0)
        expect(occurrences("Couldn't search right now.")).toBe(2)

        await type("kai")
        await wait(300)
        await wait(0)
        await type("ka")
        await wait(300)
        await wait(0)

        expect(mocks.searchPeople).toHaveBeenCalledTimes(3)
        expect(text()).not.toContain("Couldn't search right now.")
        expect(status()).toBe("Searching…")

        again.resolve({ server: [person("kai_r6z2m", "Kai Rewa")], groups: [] })
        await wait(0)
        expect(row("Kai Rewa")).toBeDefined()
    })

    it("asks again, loading, when the field comes back to a failed search before the wait ran out", async () => {
        const again = deferred<PeopleFound>()
        mocks.searchPeople.mockRejectedValueOnce(new Error("Service unavailable")).mockReturnValueOnce(again.promise)
        await open()
        await type("ka")
        await wait(300)
        await wait(0)
        expect(occurrences("Couldn't search right now.")).toBe(2)

        await type("kai")
        await wait(100)
        await type("ka")
        await wait(0)

        expect(mocks.searchPeople).toHaveBeenCalledTimes(2)
        expect(text()).not.toContain("Couldn't search right now.")
        expect(status()).toBe("Searching…")

        again.resolve({ server: [person("kai_r6z2m", "Kai Rewa")], groups: [] })
        await wait(0)
        expect(row("Kai Rewa")).toBeDefined()
    })

    it("never shows an answer for text no longer in the field", async () => {
        const first = deferred<PeopleFound>()
        const second = deferred<PeopleFound>()
        mocks.searchPeople.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
        await open()

        await type("ka")
        await wait(300)
        await type("kai")
        first.resolve({ server: [person("kaimana_v5b2r", "Kaimana")], groups: [] })
        await wait(0)

        expect(text()).not.toContain("Kaimana")
        expect(status()).toBe("Searching…")

        await wait(300)
        second.resolve({ server: [person("kai_r6z2m", "Kai Rewa")], groups: [] })
        await wait(0)

        expect(mocks.searchPeople).toHaveBeenNthCalledWith(2, IDP, "access-1", "kai")
        expect(text()).toContain("Kai Rewa")
        expect(text()).not.toContain("Kaimana")
        expect(status()).toBe("1 person found")
    })

    it("says so in each section when nobody matches", async () => {
        await open()
        await search("ka", { server: [], groups: [] })

        expect(text()).toContain(
            "No one on aotearoa.nz matches “ka”. Try fewer letters — names are matched without accents.",
        )
        expect(text()).toContain("No one in your groups matches “ka”.")
        expect(status()).toBe("0 people found")
    })

    it("finds nobody, without asking, for a query the IdP would refuse", async () => {
        await open()

        await type("a".repeat(101))
        await wait(300)
        await wait(0)

        expect(mocks.searchPeople).not.toHaveBeenCalled()
        expect(text()).toContain("No one in your groups matches")
        expect(status()).toBe("0 people found")
    })

    it("says it couldn't search, in both name sections, when the search fails", async () => {
        mocks.searchPeople.mockRejectedValueOnce(new Error("Service unavailable"))
        await open()

        await type("ka")
        await wait(300)
        await wait(0)

        expect(occurrences("Couldn't search right now.")).toBe(2)
        expect(status()).toBe("Search failed")
    })

    it("shows each person by their relation, the matched part marked, and the groups' tags", async () => {
        await open()
        await search("ma", {
            server: [
                person("mana_t4kq2", "Mana Tāwhiri"),
                person("malia_f2n7d", "Malia Fonoti", "request_sent"),
                person("makerita_p8w1z", "Makerita", "friend"),
                person("mahealani_q1x8c", "Mahealani", "request_received", { friendship_id: "f-1" }),
                person("mahina_r2kq9", "Māhina", "blocked"),
                person("mamaki_h7s3d", null),
            ],
            groups: [
                remote("kaimana_v5b2r", "pacific.im", "Kaimana", "Federation lab"),
                remote("tamatea_m3k8p", "tahiti.social", "Tamatea", null),
            ],
        })

        expect(status()).toBe("8 people found")
        expect(button("Add Mana Tāwhiri")).toBeDefined()
        expect(row("Mana Tāwhiri").querySelector("mark")?.textContent).toBe("Ma")
        expect(row("Malia Fonoti").textContent).toContain("Pending")
        expect(row("Malia Fonoti").querySelector("button")).toBeNull()
        expect(row("Makerita").textContent).toContain("Friends")
        expect(row("Makerita").querySelector("button")).toBeNull()
        expect(button("Accept Mahealani")).toBeDefined()
        expect(row("Māhina").textContent).toContain("Blocked")
        expect(row("Māhina").querySelector("button")).toBeNull()
        expect(row("Māhina").querySelector("mark")?.textContent).toBe("Mā")
        // The Display Name Rule: the handle only where the instance has no name.
        expect(button("Add mamaki_h7s3d")).toBeDefined()

        expect(row("Kaimana").textContent).toContain("Federation lab")
        expect(row("Kaimana").textContent).toContain("pacific.im")
        expect(row("Kaimana").querySelector("mark")?.textContent).toBe("ma")
        expect(row("Tamatea").textContent).toContain("tahiti.social")
        expect(row("Tamatea").querySelector(".lucide-users")).toBeNull()
        expect(row("Mana Tāwhiri").textContent).not.toContain("aotearoa.nz")
    })

    it("adds someone: Sending while asked, then Pending once the IdP answered", async () => {
        const sent = deferred<unknown>()
        mocks.sendFriendRequest.mockReturnValueOnce(sent.promise)
        await open()
        await search("kai", { server: [person("kai_r6z2m", "Kai Rewa")], groups: [] })

        await click("Add Kai Rewa")

        expect(mocks.sendFriendRequest).toHaveBeenCalledWith(IDP, "access-1", "kai_r6z2m@aotearoa.nz")
        expect(row("Kai Rewa").textContent).toContain("Sending")
        // The pending button is named by its progress bar too, as React Aria expects.
        const pending = button("Add Kai Rewa")
        const progress = pending.querySelector('[role="progressbar"]')!
        expect(progress.getAttribute("aria-label")).toBe("Sending")
        expect(pending.getAttribute("aria-labelledby")).toContain(progress.id)

        // A second press while it is asked sends nothing more.
        await click("Add Kai Rewa")
        expect(mocks.sendFriendRequest).toHaveBeenCalledOnce()

        sent.resolve({ friendship_id: "f-9", status: "pending" })
        await wait(0)
        await wait(0)

        // The search is read again; an answer still saying `none` doesn't undo the request.
        expect(mocks.searchPeople).toHaveBeenCalledTimes(2)
        expect(row("Kai Rewa").textContent).toContain("Pending")
        expect(row("Kai Rewa").querySelector("button")).toBeNull()
        expect(mocks.toastError).not.toHaveBeenCalled()
    })

    it("says what the Add came to, and gives the focus back to the field", async () => {
        mocks.sendFriendRequest.mockResolvedValueOnce({ friendship_id: "f-9", status: "pending" })
        await open()
        await search("kai", { server: [person("kai_r6z2m", "Kai Rewa")], groups: [] })

        await act(async () => button("Add Kai Rewa").focus())
        await click("Add Kai Rewa")
        await wait(0)

        expect(status()).toBe("Request sent to Kai Rewa")
        expect(document.activeElement).toBe(input())

        await type("kai ")
        expect(status()).toBe("1 person found")

        // With the focus back in the field, Escape still clears it, then closes.
        await press("Escape")
        await press("Escape")
        expect(dialog()).toBeNull()
    })

    it("gives the button back, says why, and reads the search again when adding fails", async () => {
        mocks.sendFriendRequest
            .mockRejectedValueOnce(new Error("Unblock this user first"))
            .mockResolvedValueOnce({ friendship_id: "f-9", status: "pending" })
        await open()
        await search("kai", { server: [person("kai_r6z2m", "Kai Rewa")], groups: [] })

        await click("Add Kai Rewa")
        await wait(0)

        expect(mocks.toastError).toHaveBeenCalledWith("Unblock this user first")
        expect(status()).toBe("Couldn't send a request to Kai Rewa: Unblock this user first")
        expect(button("Add Kai Rewa").textContent).toBe("Add")
        expect(mocks.searchPeople).toHaveBeenCalledTimes(2)

        await click("Add Kai Rewa")
        await wait(0)

        expect(mocks.sendFriendRequest).toHaveBeenCalledTimes(2)
        expect(row("Kai Rewa").textContent).toContain("Pending")
    })

    it("turns Add into Accept once that person's request reaches the user", async () => {
        await open()
        await search("kai", { server: [person("kai_r6z2m", "Kai Rewa")], groups: [] })
        expect(button("Add Kai Rewa")).toBeDefined()

        // What the socket's `friend_request` and the bell's answers do.
        mocks.searchPeople.mockResolvedValue({
            server: [person("kai_r6z2m", "Kai Rewa", "request_received", { friendship_id: "f-2" })],
            groups: [],
        })
        await act(async () => client.invalidateQueries({ queryKey: peopleQueryKey(IDP) }))
        await wait(0)

        expect(button("Add Kai Rewa")).toBeUndefined()
        expect(button("Accept Kai Rewa")).toBeDefined()
    })

    it("accepts a request waiting for the user, takes it off the bell and refreshes the lists", async () => {
        const accepted = deferred<void>()
        mocks.acceptFriendRequest.mockReturnValueOnce(accepted.promise)
        await open()
        await search("mah", {
            server: [person("mahealani_q1x8c", "Mahealani", "request_received", { friendship_id: "f-1" })],
            groups: [],
        })

        await click("Accept Mahealani")

        expect(row("Mahealani").textContent).toContain("Accepting")
        expect(button("Accept Mahealani").querySelector('[role="progressbar"]')?.getAttribute("aria-label")).toBe(
            "Accepting",
        )

        accepted.resolve()
        await wait(0)

        expect(mocks.acceptFriendRequest).toHaveBeenCalledWith(IDP, "access-1", "f-1")
        expect(row("Mahealani").textContent).toContain("Friends")
        expect(status()).toBe("You're now friends with Mahealani")
        expect(mocks.dismissNotification).toHaveBeenCalledWith("friend_request:f-1")
        expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: friendsQueryKey(IDP) })
        expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: dmConversationsQueryKey(IDP) })
    })

    it("gives Accept back and says why when it fails", async () => {
        mocks.acceptFriendRequest.mockRejectedValueOnce(new Error("Friendship not found"))
        await open()
        await search("mah", {
            server: [person("mahealani_q1x8c", "Mahealani", "request_received", { friendship_id: "f-1" })],
            groups: [],
        })

        await click("Accept Mahealani")
        await wait(0)

        expect(mocks.toastError).toHaveBeenCalledWith("Friendship not found")
        expect(status()).toBe("Couldn't accept Mahealani: Friendship not found")
        expect(button("Accept Mahealani").textContent).toBe("Accept")
        expect(mocks.dismissNotification).not.toHaveBeenCalled()
    })

    it("closes on Escape with the focus on a row", async () => {
        await open()
        await search("kai", { server: [person("kai_r6z2m", "Kai Rewa")], groups: [] })

        await act(async () => button("Add Kai Rewa").focus())
        await press("Escape", button("Add Kai Rewa"))

        expect(dialog()).toBeNull()
    })

    describe("the user's own address", () => {
        function clipboard(writeText: () => Promise<void>) {
            Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
        }
        const copy = () => click("Copy your full address")
        const copyButton = () => button("Copy your full address")

        it("is copied, said so for a moment, the moment starting over at a second press", async () => {
            const writeText = vi.fn(async () => {})
            clipboard(writeText)
            await open()

            await copy()
            await wait(0)
            expect(writeText).toHaveBeenCalledWith("hoku_xk9mp@aotearoa.nz")
            expect(copyButton().textContent).toBe("✓ Copied")
            expect(document.body.querySelector('.sr-only[aria-live="polite"]')?.textContent).toBe("Copied")

            await wait(COPIED_FOR_MS - 600)
            await copy()
            await wait(COPIED_FOR_MS - 1)
            expect(copyButton().textContent).toBe("✓ Copied")
            await wait(1)
            expect(copyButton().textContent).toBe("Copy address")
        })

        it("says so when it can't be copied, with no clipboard to write to", async () => {
            await open()

            await copy()
            await wait(0)

            expect(mocks.toastError).toHaveBeenCalledWith("Couldn't copy the address")
            expect(copyButton().textContent).toBe("Copy address")
        })
    })

    describe("an address", () => {
        const kai: Person = {
            actor_uri: "https://moana.social/users/kai_ab3xz",
            address: "kai_ab3xz@moana.social",
            display_name: null,
            avatar_url: null,
            relation: "none",
            friendship_id: null,
        }

        async function lookUp(answer: AddressLookup | Error) {
            if (answer instanceof Error) mocks.lookupAddress.mockRejectedValue(answer)
            else mocks.lookupAddress.mockResolvedValue(answer)
            await type("kai_ab3xz@moana.social")
            await wait(400)
            await wait(0)
        }

        it("pauses the name sections and asks for the rest while incomplete", async () => {
            await open()

            await type("kai@")
            await wait(1000)

            expect(text()).toContain("Keep going — add their server after the @, like @moana.social.")
            expect(occurrences("Paused — you're typing an address.")).toBe(2)
            expect([...document.body.querySelectorAll("span")].some((s) => s.textContent === "address")).toBe(true)
            expect(status()).toBe("Address mode — finish typing the server")
            expect(mocks.lookupAddress).not.toHaveBeenCalled()
            expect(mocks.searchPeople).not.toHaveBeenCalled()
        })

        it("looks a complete address up 400 ms after the last keystroke, asking its instance meanwhile", async () => {
            mocks.lookupAddress.mockResolvedValueOnce({ kind: "found", person: kai })
            await open()

            await type("kai_ab3xz@moana.social")
            await wait(399)

            expect(text()).toContain("asking moana.social…")
            expect(status()).toBe("Looking up the address…")
            expect(mocks.lookupAddress).not.toHaveBeenCalled()

            await wait(1)
            await wait(0)
            expect(mocks.lookupAddress).toHaveBeenCalledWith(IDP, "access-1", "kai_ab3xz@moana.social")
        })

        it("shows the person found, by their handle when they have no name, and sends them a request", async () => {
            mocks.sendFriendRequest.mockResolvedValueOnce({ friendship_id: "f-9", status: "pending" })
            await open()
            await lookUp({ kind: "found", person: kai })

            expect(text()).toContain("found on moana.social")
            expect(text()).toContain("kai_ab3xz")
            expect(status()).toBe("Address found")

            await click("Send request to kai_ab3xz")
            await wait(0)

            expect(mocks.sendFriendRequest).toHaveBeenCalledWith(IDP, "access-1", "kai_ab3xz@moana.social")
            expect(text()).toContain("Pending")
            expect(buttons().some((b) => b.textContent?.includes("Send request"))).toBe(false)
            expect(status()).toBe("Request sent to kai_ab3xz")

            // The address isn't looked up again: that would ask its instance once more.
            await wait(1000)
            expect(mocks.lookupAddress).toHaveBeenCalledOnce()
        })

        it("says when no account is at the address, where it is read out", async () => {
            await open()
            await lookUp({ kind: "not-found" })

            const note = [...document.body.querySelectorAll("p")].find((p) =>
                p.textContent?.startsWith("No account at this address on moana.social."),
            )
            expect(note?.closest('[aria-live="polite"]')).not.toBeNull()
            expect(status()).toBe("Address lookup finished")
        })

        it("never shows an answer for an address no longer in the field", async () => {
            const first = deferred<AddressLookup>()
            mocks.lookupAddress
                .mockReturnValueOnce(first.promise)
                .mockResolvedValueOnce({ kind: "not-found" } satisfies AddressLookup)
            await open()

            await type("kai_ab3xz@moana.social")
            await wait(400)
            await type("tiare_9qk2m@reef.chat")
            first.resolve({ kind: "found", person: kai })
            await wait(0)

            expect(text()).not.toContain("found on")
            expect(text()).toContain("asking reef.chat…")

            await wait(400)
            await wait(0)
            expect(mocks.lookupAddress).toHaveBeenNthCalledWith(2, IDP, "access-1", "tiare_9qk2m@reef.chat")
            expect(text()).toContain("No account at this address on reef.chat.")
            expect(text()).not.toContain("found on")
        })

        it("says when the address's instance couldn't be reached", async () => {
            await open()
            await lookUp({ kind: "unreachable" })

            expect(text()).toContain("Couldn't reach moana.social.")
        })

        it("says it couldn't search when the lookup itself fails", async () => {
            await open()
            await lookUp(new Error("Too many requests"))

            expect(occurrences("Couldn't search right now.")).toBe(1)
            expect(text()).not.toContain("asking moana.social…")
        })

        it("recognises the user's own address, with nothing to send", async () => {
            await open()
            await lookUp({
                kind: "found",
                person: { ...kai, actor_uri: "https://aotearoa.nz/users/hoku_xk9mp", display_name: "Hōkū" },
            })

            expect(text()).toContain("That's you")
            expect(buttons().some((b) => b.textContent?.includes("Send request"))).toBe(false)
        })
    })

    it("clears the field on Escape, then closes on the next", async () => {
        await open()
        await type("kai")

        await press("Escape")
        expect(input().value).toBe("")
        expect(dialog()).not.toBeNull()

        await press("Escape")
        expect(dialog()).toBeNull()
    })
})
