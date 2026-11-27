import { mergeMessageHistory } from "@pinai/domain/models/dm"
import type { GroupEvent } from "@pinai/domain/models/group-event"
import { memberName, newDeviceLine, withNewDeviceLine, type NewDeviceSeen } from "@pinai/domain/models/new-device"
import type { WsServerEvent } from "@pinai/domain/models/ws"
import type { ConversationTimeline } from "@pinai/domain/ports/conversation-cache.port"
import { MessagingRuntime } from "@pinai/domain/usecases/dm/messaging-runtime.usecase"
import {
    receiveDeliveryFailureUseCase,
    receiveEditUseCase,
    receiveMessageUseCase,
    type ReceiveContext,
} from "@pinai/domain/usecases/dm/receive-message.usecase"
import { reconcileGroupKeysUseCase } from "@pinai/domain/usecases/e2ee/reconcile-group-keys.usecase"
import { getConversationCache, getE2eePort, getGroupPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { appVisibility } from "./app-visibility"
import { conversationJoins, joinContext } from "./conversation-joins"
import { conversationList, onConversationList, refreshConversationList } from "./conversation-list"
import { isSocketConnected, onSocketConnected, onSocketEvent } from "./socket"
import { warnE2ee } from "./warn-e2ee"

/**
 * The account's conversations kept live while the device is in: the domain's `MessagingRuntime` (the archive's
 * uploads, the Welcomes, the commits, the joins), and what the socket pushes received into the conversation cache —
 * messages, edits, failed deliveries, a group's changes —, someone's new device among them. No ping and no unread
 * count: the phone shows neither yet.
 */
export function keepMessaging(): () => void {
    const { idpUrl, user } = useAppStore.getState()
    if (!idpUrl || !user) return () => undefined
    const e2ee = getE2eePort()
    const cache = getConversationCache()
    const runtime = new MessagingRuntime({
        session: { ...joinContext(idpUrl), actorUri: user.actor_uri },
        e2ee,
        joins: conversationJoins(),
        conversationsStale: refreshConversationList,
        report: warnE2ee,
    })
    const receiving = (): ReceiveContext => {
        const accessToken = useAppStore.getState().accessToken
        return { myAddress: user.address, catchUp: accessToken ? { idpUrl, accessToken } : undefined }
    }

    const receive = async (event: WsServerEvent): Promise<void> => {
        switch (event.type) {
            case "new_dm":
                await receiveMessageUseCase(event.data, receiving(), { e2ee, cache })
                if (!conversationList()?.rows.some((row) => row.id === event.data.conversation_id)) refreshConversationList()
                return
            case "message_edited":
                return receiveEditUseCase(event.data, receiving(), { e2ee, cache })
            case "dm_delivery_failed":
                return receiveDeliveryFailureUseCase(event.data, cache)
            case "group_event":
                return cache.update(event.data.conversationId, (t) => withGroupEvent(t, event.data))
            case "group_created":
            case "member_added":
            case "member_role_changed":
            case "group_renamed":
                refreshConversationList()
                return
            case "member_removed": {
                refreshConversationList()
                const accessToken = useAppStore.getState().accessToken
                // Whoever left can't commit their own devices out: an admin here does.
                if (event.data.actorUri === user.actor_uri || !accessToken) return
                await reconcileGroupKeysUseCase(idpUrl, accessToken, event.data.conversationId, user.actor_uri, getGroupPort(), e2ee)
                return
            }
            case "device_approved":
                e2ee.approvalLanded()
                return
        }
    }

    const keepNewDeviceLine = (seen: NewDeviceSeen): void => {
        const line = newDeviceLine(seen, memberName(conversationList()?.summaries ?? [], seen.conversationId, seen.actorUri))
        cache
            .update(seen.conversationId, (t) => {
                const newDeviceLines = withNewDeviceLine(t.newDeviceLines, line)
                return newDeviceLines === t.newDeviceLines ? t : { ...t, newDeviceLines }
            })
            .catch((error: unknown) => warnE2ee(`keeping the new device line of ${seen.conversationId}`, error))
    }

    // A connection up as it starts counts as the first: the start reads what it would.
    let connects = isSocketConnected() ? 1 : 0
    const stops = [
        onConversationList((list) => runtime.conversationsChanged(list.rows.map((row) => ({ id: row.id, removedAt: row.removedAt })))),
        onSocketEvent((event) => {
            runtime.socketEvent(event)
            receive(event).catch((error: unknown) => warnE2ee(`receiving ${event.type}`, error))
        }),
        onSocketConnected(() => {
            if (connects++ === 0) return
            runtime.reconnected()
            refreshConversationList()
        }),
        appVisibility.onChange(() => {
            if (appVisibility.visible()) refreshConversationList()
            // Leaving the front, a write that failed is tried while the app still runs.
            void cache.flush()
        }),
        e2ee.onNewDevice(keepNewDeviceLine),
    ]
    runtime.start()
    refreshConversationList()
    return () => {
        stops.forEach((stop) => stop())
        runtime.stop()
    }
}

// A change the history brought already changes nothing.
function withGroupEvent<M>(t: ConversationTimeline<M>, event: GroupEvent): ConversationTimeline<M> {
    if (t.groupEvents.some((held) => held.id === event.id)) return t
    return { ...t, groupEvents: mergeMessageHistory(t.groupEvents, [event]) }
}
