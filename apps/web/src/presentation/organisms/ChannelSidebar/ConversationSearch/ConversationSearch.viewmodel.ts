import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import type { KeyboardEvent } from "react-aria-components"
import { searchConversations, type TextMatch } from "@pinai/domain/models/conversation-search"
import { actorUriToAddress, addressParts, personName } from "@pinai/domain/models/identity"
import { presenceToUserStatus, type UserStatus } from "@pinai/domain/models/presence"
import { getFriendsUseCase } from "@pinai/domain/usecases/social/get-friends.usecase"
import { getSocialPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import type { AvatarTone } from "@/presentation/_libs/avatar-tone"
import { friendsQueryKey } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"
import { groupFact } from "../_helpers/group-fact.helper"

export interface MarkedText {
    /** Shown before the text, never marked: "with ", "#". */
    prefix?: string
    text: string
    match: TextMatch | null
}

export type ResultVisual =
    | { kind: "avatar"; initials: string; imageUrl: string | null; seed: string; tone?: AvatarTone; status?: UserStatus }
    | { kind: "server"; initials: string }
    | { kind: "channel" }
    | { kind: "voice" }

export interface ResultRow {
    id: string
    title: MarkedText
    subline: MarkedText
    visual: ResultVisual
    /** A group the user was removed from, dimmed as in the list. */
    isRemoved?: boolean
    open: () => void
}

export interface ResultGroup {
    id: string
    label: string
    rows: ResultRow[]
}

const initialsOf = (name: string) => name.slice(0, 2).toUpperCase()

/** `focusPending`: the ⌘K shortcut asks for the field, `onFocused` once it has it. */
export function useConversationSearchViewModel(focusPending: boolean, onFocused: () => void) {
    const [query, setQuery] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const conversations = useAppStore((s) => s.localDmConvos)
    const servers = useAppStore((s) => s.servers)
    const channelsByServer = useAppStore((s) => s.channelsByServer)
    const presenceByAddress = useAppStore((s) => s.presenceByAddress)
    const avatarsByAddress = useAppStore((s) => s.avatarsByAddress)
    const switchToServer = useAppStore((s) => s.switchToServer)
    const selectChannel = useAppStore((s) => s.selectChannel)
    const navigate = useNavigate()

    useEffect(() => {
        if (!focusPending) return
        inputRef.current?.focus()
        onFocused()
    }, [focusPending, onFocused])

    const { data: rawFriends } = useQuery({
        queryKey: friendsQueryKey(idpUrl ?? ""),
        queryFn: () => getFriendsUseCase(idpUrl!, useAppStore.getState().accessToken!, getSocialPort()),
        enabled: signedIn && !!idpUrl,
    })

    const friends = useMemo(
        () =>
            (rawFriends ?? []).map((e) => ({
                name: personName(e.friend_actor_uri, e.display_name),
                address: actorUriToAddress(e.friend_actor_uri),
                avatarUrl: e.avatar_url,
            })),
        [rawFriends],
    )

    const results = useMemo(
        () =>
            searchConversations(
                {
                    friends,
                    conversations,
                    servers: servers.map((server) => ({ server, channels: channelsByServer[server.id] ?? [] })),
                },
                query,
            ),
        [friends, conversations, servers, channelsByServer, query],
    )

    function opening(go: () => void) {
        return () => {
            setQuery("")
            go()
        }
    }

    const people = results.people.map(
        ({ item: friend, field, match }): ResultRow => ({
            id: `person:${friend.address}`,
            title: { text: friend.name, match: field === "name" ? match : null },
            subline:
                field === "address"
                    ? { text: friend.address, match }
                    : { text: `friend · ${addressParts(friend.address).host}`, match: null },
            visual: {
                kind: "avatar",
                initials: initialsOf(friend.name),
                imageUrl: friend.avatarUrl,
                seed: friend.address,
                status: presenceToUserStatus(presenceByAddress[friend.address]),
            },
            open: opening(() => navigate({ to: "/dm/$name", params: { name: friend.address } })),
        }),
    )

    const conversationRows = results.conversations.map(
        ({ item: dm, field, text, match }): ResultRow => ({
            id: `conversation:${dm.id}`,
            title: { text: dm.displayName, match: field === "name" ? match : null },
            subline:
                dm.kind === "dm"
                    ? { text: dm.address, match: field === "address" ? match : null }
                    : field === "member"
                      ? { prefix: "with ", text, match }
                      : { text: groupFact(dm), match: null },
            visual: {
                kind: "avatar",
                initials: dm.avatar,
                imageUrl: dm.kind === "dm" ? (avatarsByAddress[dm.address] ?? null) : null,
                seed: dm.address,
                tone: dm.kind === "group" ? "sec" : undefined,
                status: dm.kind === "dm" ? presenceToUserStatus(presenceByAddress[dm.address]) : undefined,
            },
            isRemoved: dm.removedAt != null,
            open: opening(() => navigate({ to: "/dm/$name", params: { name: dm.id } })),
        }),
    )

    const places = results.places.map(({ item: place, match }): ResultRow => {
        if (place.kind === "server") {
            return {
                id: `server:${place.server.id}`,
                title: { text: place.server.name, match },
                subline: { text: "server", match: null },
                visual: { kind: "server", initials: place.server.initials },
                open: opening(() => switchToServer(place.server.id)),
            }
        }
        const voice = place.channel.type === "voice"
        return {
            id: `channel:${place.server.id}:${place.channel.id}`,
            title: { prefix: voice ? undefined : "#", text: place.channel.name, match },
            subline: { text: voice ? `${place.server.name} · voice` : place.server.name, match: null },
            visual: { kind: voice ? "voice" : "channel" },
            open: opening(() => {
                switchToServer(place.server.id)
                selectChannel(place.channel.id)
            }),
        }
    })

    const groups: ResultGroup[] = [
        { id: "people", label: "People", rows: people },
        { id: "conversations", label: "Conversations", rows: conversationRows },
        { id: "places", label: "Servers & channels", rows: places },
    ].filter((group) => group.rows.length > 0)

    function onFieldKeyDown(e: KeyboardEvent) {
        // React Aria highlights the first row only after typed text, not after a paste or a
        // deletion; a highlighted row has already taken the Enter (default prevented).
        if (e.key === "Enter" && !e.isDefaultPrevented()) groups[0]?.rows[0]?.open()
    }

    return {
        query,
        setQuery,
        inputRef,
        searching: query.trim() !== "",
        groups,
        count: people.length + conversationRows.length + places.length,
        onFieldKeyDown,
    }
}
