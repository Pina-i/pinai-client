import { oneAtATime } from "@pinai/domain/lib/one-at-a-time"
import { groupFact } from "@pinai/domain/models/conversation-list"
import { actorUriToAddress, asActorUri } from "@pinai/domain/models/identity"
import type { CachedTimelineMessage } from "@pinai/domain/ports/conversation-cache.port"
import { loadConversationUseCase } from "@pinai/domain/usecases/dm/load-conversation.usecase"
import type { SendRoute } from "@pinai/domain/usecases/dm/send-message.usecase"
import { router } from "expo-router"
import { type RefObject, useCallback, useEffect, useMemo, useState } from "react"
import type { FlatList } from "react-native"
import { getConversationCache, getDmPort, getE2eePort } from "@/ioc"
import { clearUnread, refreshConversationList, useConversationList } from "@/presentation/_libs/conversation-list"
import { messageSends, sendContext } from "@/presentation/_libs/message-sends"
import { showConversation } from "@/presentation/_libs/open-conversation"
import { onSocketConnected } from "@/presentation/_libs/socket"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useConversationTimeline } from "@/presentation/hooks/use-conversation-timeline"
import { useAppStore } from "@/store/store"
import { timelineRows, type TimelineRow } from "./timeline-rows"

type History = "loading" | "loaded" | "failed"

/**
 * A conversation: its timeline from the phone's cache, its first history page read as it opens — which marks it read on
 * the IdP — and again when the socket comes back; the text sent through the app's `MessageSends`.
 */
export function useConversationViewModel(conversationId: string, listRef: RefObject<FlatList<TimelineRow<CachedTimelineMessage>> | null>) {
    const user = useAppStore((s) => s.user)
    const list = useConversationList()
    const at = list ? list.rows.findIndex((row) => row.id === conversationId) : -1
    const row = list && at >= 0 ? list.rows[at] : null
    const summary = list && at >= 0 ? list.summaries[at] : null
    const muted = useAppStore((s) => s.notifications.mutedConversations.includes(conversationId))
    const timeline = useConversationTimeline(conversationId)
    const [history, setHistory] = useState<History>("loading")
    const [draft, setDraft] = useState("")

    // One read at a time: one asked meanwhile runs once after it, for what came during the first.
    const load = useMemo(
        () =>
            oneAtATime(async () => {
                const { idpUrl, accessToken, user } = useAppStore.getState()
                if (!idpUrl || !accessToken || !user) return
                clearUnread(conversationId)
                try {
                    await loadConversationUseCase({ idpUrl, accessToken }, conversationId, user, {
                        port: getDmPort(),
                        refreshList: refreshConversationList,
                        e2ee: getE2eePort(),
                        cache: getConversationCache(),
                    })
                    setHistory("loaded")
                } catch (error) {
                    warnE2ee(`loading the conversation ${conversationId}`, error)
                    setHistory((was) => (was === "loaded" ? was : "failed"))
                }
            }),
        [conversationId]
    )

    useEffect(() => showConversation(conversationId), [conversationId])
    useEffect(() => {
        void load()
        // The socket closes in the background: back in front, what came meanwhile is read, and marked read.
        return onSocketConnected(() => void load())
    }, [load])
    useEffect(() => {
        messageSends()
            .settleStale(conversationId)
            .catch((error: unknown) => warnE2ee(`settling the sends of ${conversationId}`, error))
    }, [conversationId])

    const myActorUri = user?.actor_uri ?? ""
    const rows = useMemo(() => (timeline ? timelineRows(timeline, myActorUri, new Date()) : []), [timeline, myActorUri])

    const avatars = useMemo(() => {
        const byAddress = new Map<string, string | null>()
        for (const member of summary?.members ?? []) byAddress.set(actorUriToAddress(member.actorUri), member.avatarUrl)
        if (user) byAddress.set(user.address, user.avatar_url ?? null)
        return byAddress
    }, [summary, user])

    const removed = row?.removedAt != null
    const route = useMemo<SendRoute | null>(
        () =>
            row
                ? {
                      conversationId: row.id,
                      kind: row.kind,
                      recipientAddress: row.address,
                      recipientActorUri: row.actorUri ? asActorUri(row.actorUri) : null,
                  }
                : null,
        [row]
    )
    const canWrite = route !== null && !removed && (route.kind === "group" || route.recipientActorUri !== null)

    const scrollToNewest = useCallback(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), [listRef])

    const send = useCallback(() => {
        const { idpUrl, user } = useAppStore.getState()
        const content = draft.trim()
        if (!content || !route || !canWrite || !idpUrl || !user) return
        setDraft("")
        messageSends()
            .send({ ...route, content, replyTo: null, attachmentIds: [], attachmentKeys: [] }, sendContext(idpUrl, user))
            .catch((error: unknown) => warnE2ee(`sending to ${conversationId}`, error))
        scrollToNewest()
    }, [draft, route, canWrite, conversationId, scrollToNewest])

    const retry = useCallback(
        (messageId: string) => {
            const { idpUrl, user } = useAppStore.getState()
            if (!route || !idpUrl || !user) return
            messageSends()
                .retry(route, messageId, sendContext(idpUrl, user))
                // An undelivered message goes out again as a new one, at the end.
                .then((outcome) => outcome === "resent" && scrollToNewest())
                .catch((error: unknown) => warnE2ee(`sending ${messageId} again`, error))
        },
        [route, scrollToNewest]
    )

    const back = useCallback(() => (router.canGoBack() ? router.back() : router.replace("/home")), [])

    const empty = rows.length === 0
    return {
        rows,
        avatars,
        myAddress: user?.address,
        name: row?.displayName ?? "",
        isGroup: row?.kind === "group",
        avatarSeed: row?.address ?? conversationId,
        avatarUrl: row?.kind === "dm" ? (summary?.members[0]?.avatarUrl ?? null) : null,
        muted: muted && !removed,
        headLine: row?.kind === "group" ? groupFact(row) : null,
        unavailable: list !== null && row === null,
        removed,
        canWrite,
        loading: empty && (timeline === undefined || history === "loading"),
        empty: empty && timeline !== undefined && history === "loaded",
        loadFailed: history === "failed",
        reload: () => void load(),
        draft,
        setDraft,
        send,
        retry,
        back,
    }
}
