import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { TextMatch } from "@pinai/domain/models/conversation-search"
import { addressParts, personName } from "@pinai/domain/models/identity"
import {
    nameMatch,
    searchMode,
    shownRelation,
    type GroupPerson,
    type Person,
    type PersonAction,
    type ShownRelation,
} from "@pinai/domain/models/people-search"
import { lookupAddressUseCase } from "@pinai/domain/usecases/social/lookup-address.usecase"
import { searchPeopleUseCase } from "@pinai/domain/usecases/social/search-people.usecase"
import { sendFriendRequestUseCase } from "@pinai/domain/usecases/social/send-friend-request.usecase"
import { getSocialPort } from "@/ioc"
import { useDebouncedValue } from "@/presentation/hooks/use-debounced-value"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import { useAppStore } from "@/store/store"
import { friendsQueryKey } from "../FriendsPanel.viewmodel"
import { peopleLookupQueryKey, peopleNamesQueryKey } from "./people-query-keys"

export const NAME_SEARCH_DELAY_MS = 300
export const ADDRESS_LOOKUP_DELAY_MS = 400
export const COPIED_FOR_MS = 1600

export interface PersonView {
    person: Person
    name: string
    initials: string
    match: TextMatch | null
    /** The group the two share; `null` on the server section, or for an unnamed group. */
    group: string | null
    host: string
    shown: ShownRelation
}

export type NamesView =
    | { kind: "paused" }
    | { kind: "loading" }
    | { kind: "failed" }
    | { kind: "found"; query: string; server: PersonView[]; groups: PersonView[] }

export type AddressView =
    | { kind: "idle" }
    | { kind: "incomplete" }
    | { kind: "loading"; domain: string }
    | { kind: "found"; domain: string; person: PersonView; isSelf: boolean }
    | { kind: "not-found"; domain: string }
    | { kind: "unreachable"; domain: string }
    | { kind: "failed"; domain: string }

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong")

export function useAddFriendPopoverViewModel() {
    const user = useAppStore((s) => s.user)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const dismissNotification = useAppStore((s) => s.dismissNotification)
    const queryClient = useQueryClient()

    const [text, setText] = useState("")
    const [actions, setActions] = useState<Record<string, PersonAction>>({})
    // What the user's last Add or Accept came to, said in the status line until they type again.
    const [notice, setNotice] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => () => clearTimeout(copiedTimer.current ?? undefined), [])

    const mode = searchMode(text)
    const domain = user ? addressParts(user.address).host : ""

    const nameQuery = mode.kind === "names" ? mode.query : null
    const settledName = useDebouncedValue(nameQuery, NAME_SEARCH_DELAY_MS)
    const names = useQuery({
        queryKey: [...peopleNamesQueryKey(idpUrl ?? ""), settledName],
        queryFn: () =>
            searchPeopleUseCase(idpUrl!, useAppStore.getState().accessToken!, settledName!, getSocialPort()),
        // Only the text still in the field: one it held for a moment is never asked.
        enabled: signedIn && idpUrl !== null && settledName !== null && settledName === nameQuery,
        retry: false,
    })

    const addressQuery = mode.kind === "address" ? mode.address : null
    const settledAddress = useDebouncedValue(addressQuery, ADDRESS_LOOKUP_DELAY_MS)
    const lookup = useQuery({
        queryKey: [...peopleLookupQueryKey(idpUrl ?? ""), settledAddress],
        queryFn: () =>
            lookupAddressUseCase(idpUrl!, useAppStore.getState().accessToken!, settledAddress!, getSocialPort()),
        enabled: signedIn && idpUrl !== null && settledAddress !== null && settledAddress === addressQuery,
        retry: false,
    })

    function view(person: Person | GroupPerson, query: string | null): PersonView {
        const name = personName(person.actor_uri, person.display_name)
        return {
            person,
            name,
            initials: Array.from(name).slice(0, 2).join("").toUpperCase(),
            match: query === null ? null : nameMatch(name, query),
            group: "group" in person ? person.group : null,
            host: addressParts(person.address).host,
            shown: shownRelation(person.relation, actions[person.actor_uri]),
        }
    }

    function namesView(): NamesView | null {
        if (mode.kind === "intro") return null
        if (mode.kind !== "names") return { kind: "paused" }
        // An answer counts only for the text the field holds now.
        if (settledName !== mode.query) return { kind: "loading" }
        if (names.data) {
            return {
                kind: "found",
                query: mode.query,
                server: names.data.server.map((p) => view(p, mode.query)),
                groups: names.data.groups.map((p) => view(p, mode.query)),
            }
        }
        // A search that failed before is asked again on its way back: loading, not the old failure.
        return { kind: names.isError && names.fetchStatus !== "fetching" ? "failed" : "loading" }
    }

    function addressView(): AddressView | null {
        if (mode.kind === "intro") return null
        if (mode.kind === "names") return { kind: "idle" }
        if (mode.kind === "address-incomplete") return { kind: "incomplete" }
        const at = mode.domain
        if (settledAddress !== mode.address) return { kind: "loading", domain: at }
        if (!lookup.data) {
            return { kind: lookup.isError && lookup.fetchStatus !== "fetching" ? "failed" : "loading", domain: at }
        }
        if (lookup.data.kind !== "found") return { kind: lookup.data.kind, domain: at }
        const person = lookup.data.person
        return { kind: "found", domain: at, person: view(person, null), isSelf: person.actor_uri === user?.actor_uri }
    }

    const namesShown = namesView()
    const addressShown = addressView()

    function statusLine(): string {
        if (mode.kind === "address" || mode.kind === "address-incomplete") {
            if (addressShown?.kind === "loading") return "Looking up the address…"
            if (addressShown?.kind === "found") return "Address found"
            if (addressShown?.kind === "incomplete") return "Address mode — finish typing the server"
            return "Address lookup finished"
        }
        if (mode.kind === "intro") {
            return text.trim() ? "One more letter…" : "Search names on your server and in your groups, or paste a full address"
        }
        if (namesShown?.kind === "failed") return "Search failed"
        if (namesShown?.kind !== "found") return "Searching…"
        const count = namesShown.server.length + namesShown.groups.length
        return count === 1 ? "1 person found" : `${count} people found`
    }

    function type(value: string) {
        setText(value)
        setNotice(null)
    }

    function settle(actorUri: string, action: PersonAction | null) {
        setActions((current) => {
            const next = { ...current }
            if (action) next[actorUri] = action
            else delete next[actorUri]
            return next
        })
    }

    async function perform(
        person: Person,
        kind: PersonAction["kind"],
        said: { sent: string; failed: string },
        send: (idp: string, token: string) => Promise<unknown>,
    ): Promise<string | undefined> {
        const { idpUrl: idp, accessToken } = useAppStore.getState()
        if (!idp || !accessToken) return
        const pressed = document.activeElement
        const action: PersonAction = { kind, from: person.relation, answered: false }
        settle(person.actor_uri, action)
        try {
            await send(idp, accessToken)
            settle(person.actor_uri, { ...action, answered: true })
            setNotice(said.sent)
            // The button turns into a chip: the field takes the focus back, unless the user moved on.
            const focused = document.activeElement
            if (!focused || focused === document.body || focused === pressed) inputRef.current?.focus()
            return idp
        } catch (e) {
            settle(person.actor_uri, null)
            setNotice(`${said.failed}: ${errorMessage(e)}`)
            toast.error(errorMessage(e))
        } finally {
            // Names only: a lookup asked again resolves the address on its instance once more.
            void queryClient.invalidateQueries({ queryKey: peopleNamesQueryKey(idp) })
        }
    }

    async function add(person: Person) {
        const name = personName(person.actor_uri, person.display_name)
        // The address as the IdP answered it: the request route takes it as sent.
        await perform(
            person,
            "add",
            { sent: `Request sent to ${name}`, failed: `Couldn't send a request to ${name}` },
            (idp, token) => sendFriendRequestUseCase(idp, token, person.address, getSocialPort()),
        )
    }

    async function accept(person: Person) {
        const friendshipId = person.friendship_id
        if (!friendshipId) return
        const name = personName(person.actor_uri, person.display_name)
        const idp = await perform(
            person,
            "accept",
            { sent: `You're now friends with ${name}`, failed: `Couldn't accept ${name}` },
            (idp, token) => getSocialPort().acceptFriendRequest(idp, token, friendshipId),
        )
        if (!idp) return
        // The bell lists the request by this id, whether the socket or the page load brought it.
        dismissNotification(`friend_request:${friendshipId}`)
        void queryClient.invalidateQueries({ queryKey: friendsQueryKey(idp) })
        void queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idp) })
    }

    function copyAddress() {
        if (!user) return
        // Undefined outside a secure context, whatever its type says.
        const clipboard: Clipboard | undefined = navigator.clipboard
        const copying = clipboard ? clipboard.writeText(user.address) : Promise.reject(new Error("No clipboard"))
        copying.then(
            () => {
                clearTimeout(copiedTimer.current ?? undefined)
                setCopied(true)
                copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS)
            },
            () => toast.error("Couldn't copy the address"),
        )
    }

    return {
        text,
        setText: type,
        inputRef,
        isIntro: mode.kind === "intro",
        isAddressMode: mode.kind === "address" || mode.kind === "address-incomplete",
        isBusy: namesShown?.kind === "loading" || addressShown?.kind === "loading",
        status: notice ?? statusLine(),
        domain,
        names: namesShown,
        address: addressShown,
        add,
        accept,
        userAddress: user?.address ?? "",
        copied,
        copyAddress,
    }
}
