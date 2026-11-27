import { oneAtATime } from "@pinai/domain/lib/one-at-a-time"
import { conversationRow, type ConversationRow } from "@pinai/domain/models/conversation-list"
import type { DmConversationSummary } from "@pinai/domain/models/dm"
import { getDmConversationsUseCase } from "@pinai/domain/usecases/dm/get-dm-conversations.usecase"
import { useSyncExternalStore } from "react"
import { getDmPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { warnE2ee } from "./warn-e2ee"

/** The conversations as the IdP lists them, with the rows every client names them by. */
export interface ConversationList {
    summaries: readonly DmConversationSummary[]
    rows: readonly ConversationRow[]
}

let held: { actorUri: string; list: ConversationList } | null = null
const listeners = new Set<(list: ConversationList) => void>()
// The account whose last read failed, so a screen with no list yet can say so.
let failedFor: string | null = null
const failureListeners = new Set<() => void>()

const read = oneAtATime(async (): Promise<void> => {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (!idpUrl || !accessToken || !user) return
    try {
        const summaries = await getDmConversationsUseCase(idpUrl, accessToken, getDmPort())
        if (useAppStore.getState().user?.actor_uri !== user.actor_uri) return
        hold(user.actor_uri, { summaries, rows: summaries.map(conversationRow) })
        failed(null)
    } catch (error) {
        failed(user.actor_uri)
        throw error
    }
})

function hold(actorUri: string, list: ConversationList): void {
    held = { actorUri, list }
    for (const listener of listeners) listener(list)
}

function failed(actorUri: string | null): void {
    if (failedFor === actorUri) return
    failedFor = actorUri
    for (const listener of failureListeners) listener()
}

/** The list read again, in the background. */
export function refreshConversationList(): void {
    read().catch((error: unknown) => warnE2ee("reading the conversation list", error))
}

// The held list's count changed at once, the IdP's own coming with the next read.
function changeUnread(conversationId: string, count: (unread: number) => number): void {
    const list = conversationList()
    if (!held || !list) return
    let changed = false
    const summaries = list.summaries.map((summary) => {
        if (summary.conversation_id !== conversationId) return summary
        const unread = count(summary.unread_count)
        if (unread === summary.unread_count) return summary
        changed = true
        return { ...summary, unread_count: unread }
    })
    if (changed) hold(held.actorUri, { summaries, rows: list.rows })
}

/** Opened: nothing in it waits for the user any more. */
export function clearUnread(conversationId: string): void {
    changeUnread(conversationId, () => 0)
}

/** A message arrived that nobody is reading. */
export function countUnread(conversationId: string): void {
    changeUnread(conversationId, (unread) => unread + 1)
}

/** The list last read for the account signed in, `null` before. */
export function conversationList(): ConversationList | null {
    return held && held.actorUri === useAppStore.getState().user?.actor_uri ? held.list : null
}

/** Told at once of the list held, then at each read. */
export function onConversationList(listener: (list: ConversationList) => void): () => void {
    listeners.add(listener)
    const now = conversationList()
    if (now) listener(now)
    return () => listeners.delete(listener)
}

export function useConversationList(): ConversationList | null {
    return useSyncExternalStore(subscribe, conversationList)
}

/** Whether the last read failed for the account signed in. */
export function useConversationListFailed(): boolean {
    return useSyncExternalStore(subscribeFailures, () => failedFor !== null && failedFor === useAppStore.getState().user?.actor_uri)
}

function subscribeFailures(onChange: () => void): () => void {
    failureListeners.add(onChange)
    return () => failureListeners.delete(onChange)
}

function subscribe(onChange: () => void): () => void {
    const listener = () => onChange()
    listeners.add(listener)
    return () => listeners.delete(listener)
}
