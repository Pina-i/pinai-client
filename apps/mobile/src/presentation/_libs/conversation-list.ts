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

const read = oneAtATime(async (): Promise<void> => {
    const { idpUrl, accessToken, user } = useAppStore.getState()
    if (!idpUrl || !accessToken || !user) return
    const summaries = await getDmConversationsUseCase(idpUrl, accessToken, getDmPort())
    if (useAppStore.getState().user?.actor_uri !== user.actor_uri) return
    const list = { summaries, rows: summaries.map(conversationRow) }
    held = { actorUri: user.actor_uri, list }
    for (const listener of listeners) listener(list)
})

/** The list read again, in the background. */
export function refreshConversationList(): void {
    read().catch((error: unknown) => warnE2ee("reading the conversation list", error))
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

function subscribe(onChange: () => void): () => void {
    const listener = () => onChange()
    listeners.add(listener)
    return () => listeners.delete(listener)
}
