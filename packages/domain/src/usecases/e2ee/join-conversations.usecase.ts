import {
    GroupToJoin,
    WELCOME_WAIT_MS,
    conversationsToJoin,
    joinRetryDelay,
    siblingWait,
} from "../../models/conversation-join"
import type { DeviceListEntry } from "../../models/device"
import type { ActorUri, ConversationId } from "../../models/e2ee"
import type { IDeviceDirectoryPort } from "../../ports/device-directory.port"
import type { IE2eePort } from "../../ports/e2ee.port"

export interface ConversationJoinsDeps {
    e2ee: Pick<IE2eePort, "joinConversation" | "heldGroups" | "onGroupHeld" | "getDeviceId">
    deviceDirectory: Pick<IDeviceDirectoryPort, "listDevices">
    /** Runs `run` in `ms`, answering what cancels it. */
    after: (ms: number, run: () => void) => () => void
    now?: () => number
    /** A join that failed for now: tried again later. */
    report?: (conversationId: ConversationId, error: unknown) => void
}

export interface JoinContext {
    idpUrl: string
    accessToken: () => string | null
}

/** Where a send goes on from: the device holds the group (`in`), or the conversation has none yet. */
export type ConversationEntry = "in" | "no-group"

type Waiter = { resolve: (entry: ConversationEntry) => void; reject: (error: unknown) => void }

type Missing = {
    /** When this page load found it missing: an online sibling's minute runs from then. */
    since: number
    /** When the tree was first found naming this device: the Welcome's minute runs from then. */
    welcomeDueSince: number | null
    running: Promise<void> | null
    cancel: (() => void) | null
    retries: number
    waiters: Waiter[]
}

/** A device list read this recently answers the next look too: a sync looks at every conversation missing. */
const DEVICES_READ_FOR_MS = 30_000

/**
 * The device into the conversations it holds no group for, by itself
 * (`identity-provider/specs/e2ee.md § 6.14`), for the page load. One join of a conversation at a
 * time; each held group (`onGroupHeld`: a Welcome, a founding, a join) settles its conversation.
 * While an approved sibling is online it is left a minute to add this device first
 * (`siblingWait`), and a tree naming this device a minute for the Welcome on its way; then the
 * device joins. A join left unanswered or refused for now is tried again on
 * `joinRetryDelay`; one refused for good stays so for the page load, and fails what waits on it.
 */
export class ConversationJoins {
    private readonly deps: ConversationJoinsDeps
    private readonly now: () => number
    private readonly missing = new Map<ConversationId, Missing>()
    private readonly refused = new Map<ConversationId, unknown>()
    private context: JoinContext | null = null
    private devicesRead: { at: number; devices: Promise<readonly DeviceListEntry[]> } | null = null
    private readonly stopHeld: () => void

    constructor(deps: ConversationJoinsDeps) {
        this.deps = deps
        this.now = deps.now ?? Date.now
        this.stopHeld = deps.e2ee.onGroupHeld((conversationId) => this.settle(conversationId, "in"))
    }

    /** At start, on reconnect, when the list changes: each conversation of it this device holds no group for. */
    async sync(
        context: JoinContext,
        conversations: readonly { id: ConversationId; removedAt: string | null }[],
    ): Promise<void> {
        this.context = context
        const toJoin = conversationsToJoin(conversations, await this.deps.e2ee.heldGroups())
        for (const conversationId of toJoin) {
            if (!this.refused.has(conversationId)) await this.consider(conversationId)
        }
    }

    /**
     * Before a send: `in` once the device holds the group — now, or once a Welcome or its own join
     * brings it in —, `no-group` while the conversation has none; rejects once the join is refused
     * for good.
     */
    whenIn(context: JoinContext, conversationId: ConversationId): Promise<ConversationEntry> {
        this.context = context
        if (this.refused.has(conversationId)) return Promise.reject(this.refused.get(conversationId))
        return new Promise<ConversationEntry>((resolve, reject) => {
            this.entry(conversationId).waiters.push({ resolve, reject })
            void this.consider(conversationId)
        })
    }

    stop(): void {
        this.stopHeld()
        for (const entry of this.missing.values()) entry.cancel?.()
        this.missing.clear()
    }

    private entry(conversationId: ConversationId): Missing {
        let entry = this.missing.get(conversationId)
        if (!entry) {
            entry = { since: this.now(), welcomeDueSince: null, running: null, cancel: null, retries: 0, waiters: [] }
            this.missing.set(conversationId, entry)
        }
        return entry
    }

    private consider(conversationId: ConversationId): Promise<void> {
        const entry = this.entry(conversationId)
        entry.running ??= this.attempt(conversationId, entry).finally(() => {
            entry.running = null
        })
        return entry.running
    }

    private async attempt(conversationId: ConversationId, entry: Missing): Promise<void> {
        const context = this.context
        const accessToken = context?.accessToken()
        if (!context || !accessToken) return
        entry.cancel?.()
        entry.cancel = null
        const { e2ee } = this.deps
        try {
            if ((await e2ee.heldGroups()).includes(conversationId)) return this.settle(conversationId, "in")
            let siblingLeft = 0
            if (this.now() - entry.since < WELCOME_WAIT_MS) {
                const devices = await this.devices(context.idpUrl, accessToken)
                siblingLeft = siblingWait(devices, await e2ee.getDeviceId(), entry.since, this.now())
            }
            const welcomeOverdue =
                entry.welcomeDueSince !== null && this.now() - entry.welcomeDueSince >= WELCOME_WAIT_MS
            const outcome = await e2ee.joinConversation(context.idpUrl, accessToken, conversationId, {
                welcomeOverdue,
                siblingMayAdd: siblingLeft > 0,
            })
            entry.retries = 0
            switch (outcome.kind) {
                case "joined":
                case "held":
                    return this.settle(conversationId, "in")
                case "no-group":
                    return this.answer(entry, "no-group")
                case "welcome-due":
                    entry.welcomeDueSince ??= this.now()
                    return this.retryIn(conversationId, entry, entry.welcomeDueSince + WELCOME_WAIT_MS - this.now())
                case "left-to-sibling":
                    return this.retryIn(conversationId, entry, entry.since + WELCOME_WAIT_MS - this.now())
                case "not-added":
                    // The add brings its Welcome, and the group held settles it.
                    return
                case "refused":
                    return this.refuse(conversationId, outcome.error)
            }
        } catch (error) {
            this.deps.report?.(conversationId, error)
            this.retryIn(conversationId, entry, joinRetryDelay(entry.retries++))
        }
    }

    private devices(idpUrl: string, accessToken: string): Promise<readonly DeviceListEntry[]> {
        const now = this.now()
        if (!this.devicesRead || now - this.devicesRead.at >= DEVICES_READ_FOR_MS) {
            const devices = this.deps.deviceDirectory.listDevices(idpUrl, accessToken).then((r) => r.devices)
            this.devicesRead = { at: now, devices }
            devices.catch(() => {
                if (this.devicesRead?.devices === devices) this.devicesRead = null
            })
        }
        return this.devicesRead.devices
    }

    private retryIn(conversationId: ConversationId, entry: Missing, ms: number): void {
        entry.cancel?.()
        entry.cancel = this.deps.after(Math.max(0, ms), () => {
            entry.cancel = null
            void this.consider(conversationId)
        })
    }

    private answer(entry: Missing, way: ConversationEntry): void {
        const waiters = entry.waiters.splice(0)
        for (const waiter of waiters) waiter.resolve(way)
    }

    private settle(conversationId: ConversationId, way: ConversationEntry): void {
        this.refused.delete(conversationId)
        const entry = this.missing.get(conversationId)
        if (!entry) return
        entry.cancel?.()
        this.missing.delete(conversationId)
        this.answer(entry, way)
    }

    private refuse(conversationId: ConversationId, error: unknown): void {
        this.refused.set(conversationId, error)
        const entry = this.missing.get(conversationId)
        if (!entry) return
        entry.cancel?.()
        this.missing.delete(conversationId)
        for (const waiter of entry.waiters.splice(0)) waiter.reject(error)
    }
}

/**
 * Before a send: the device holds the conversation's group — at once, or once a Welcome or its own
 * join brings it in, the send waiting meanwhile —, or founds it: a DM (`peer`, its other member)
 * with no group yet. Throws once the join is refused for good, and for a group without one.
 */
export async function enterConversationUseCase(
    joins: Pick<ConversationJoins, "whenIn">,
    e2ee: Pick<IE2eePort, "ensureGroupExists">,
    context: JoinContext,
    conversation: { id: ConversationId; peer: ActorUri | null },
): Promise<void> {
    for (let founding = 0; ; founding++) {
        if ((await joins.whenIn(context, conversation.id)) === "in") return
        const accessToken = context.accessToken()
        if (!conversation.peer || !accessToken) throw new Error(`No MLS group to send to in ${conversation.id}`)
        try {
            await e2ee.ensureGroupExists(context.idpUrl, accessToken, conversation.id, conversation.peer)
            return
        } catch (error) {
            // Founded meanwhile by another device: a Welcome or a join brings this one in.
            if (!(error instanceof GroupToJoin) || founding >= 2) throw error
        }
    }
}
