/**
 * A device holding no group for a conversation of its list joins it by itself
 * (`identity-provider/specs/e2ee.md § 6.14`): the rules — which conversations, the minute left to
 * an online sibling or to a Welcome on its way, what a refusal means — and the page load's
 * coordinator, over a fake engine and a fake clock. The real engines run in `e2ee-integration.spec.ts`.
 */
import { describe, expect, it } from "vitest"

import {
    GroupToJoin,
    JOIN_RETRY_MS,
    WELCOME_WAIT_MS,
    conversationsToJoin,
    joinFailure,
    joinRetryDelay,
    joinStanding,
    siblingOnline,
    siblingWait,
    type ConversationJoin,
} from "@pinai/domain/models/conversation-join"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import type { ActorUri, ConversationId } from "@pinai/domain/models/e2ee"
import { IdpError } from "@pinai/domain/models/idp-error"
import type { LeafCredential } from "@pinai/domain/models/leaf-trust"
import {
    ConversationJoins,
    enterConversationUseCase,
    type JoinContext,
} from "@pinai/domain/usecases/e2ee/join-conversations.usecase"

const me = "https://idp.test/users/alice" as ActorUri
const bob = "https://idp.test/users/bob" as ActorUri
const NOW = Date.parse("2026-11-16T12:00:00Z")

function device(device_id: string, change: Partial<DeviceListEntry> = {}): DeviceListEntry {
    return {
        device_id,
        display_name: device_id,
        kind: "laptop",
        paired_at: "2026-11-01T00:00:00Z",
        last_seen_at: "2026-11-16T11:59:00Z",
        revoked_at: null,
        signed_in: true,
        last_active_at: "2026-11-16T11:30:00Z",
        drk_public_key: null,
        attestation_signature: null,
        attestation_kid: null,
        attestation_expires_at: null,
        hpke_public_key: null,
        hpke_key_signature: null,
        history_generation: 1,
        approvals: [{ by: "passphrase", generation: 1, signature: new Uint8Array(64), created_at: "2026-11-01T00:00:00Z" }],
        ...change,
    }
}

function leaf(actor_uri: ActorUri, device_id: string, own = false) {
    return { credential: { actor_uri, device_id } as LeafCredential, signatureKey: new Uint8Array(32), own }
}

describe("conversationsToJoin", () => {
    it("is every conversation of the list without a group here, but those the user was removed from", () => {
        const list = [
            { id: "held", removedAt: null },
            { id: "dm", removedAt: null },
            { id: "removed", removedAt: "2026-11-10T00:00:00Z" },
            { id: "group", removedAt: null },
        ]

        expect(conversationsToJoin(list, ["held"])).toEqual(["dm", "group"])
        expect(conversationsToJoin(list, ["held", "dm", "group"])).toEqual([])
    })
})

describe("siblingOnline / siblingWait", () => {
    it("counts another device approved, unrevoked, signed in and used within the hour", () => {
        expect(siblingOnline([device("laptop"), device("phone")], "laptop", NOW)).toBe(true)
        expect(siblingOnline([device("laptop")], "laptop", NOW)).toBe(false)
        for (const change of [
            { revoked_at: "2026-11-15T00:00:00Z" },
            { signed_in: false, last_active_at: null },
            { last_active_at: "2026-11-16T10:59:00Z" },
            { approvals: [] },
        ]) {
            expect(siblingOnline([device("laptop"), device("phone", change)], "laptop", NOW)).toBe(false)
        }
    })

    it("leaves what is left of the minute since the conversation was found missing, while one is online", () => {
        const online = [device("laptop"), device("phone")]

        expect(siblingWait(online, "laptop", NOW - 20_000, NOW)).toBe(40_000)
        expect(siblingWait(online, "laptop", NOW - WELCOME_WAIT_MS, NOW)).toBe(0)
        expect(siblingWait([device("laptop")], "laptop", NOW, NOW)).toBe(0)
    })
})

describe("joinStanding", () => {
    it("joins where the account's devices are and this one isn't", () => {
        expect(joinStanding([leaf(bob, "b1"), leaf(me, "lost"), leaf(me, "laptop", true)], me, "laptop")).toBe("join")
    })

    it("leaves it to the Welcome on its way when the tree names this device", () => {
        expect(joinStanding([leaf(bob, "b1"), leaf(me, "laptop"), leaf(me, "laptop", true)], me, "laptop")).toBe(
            "welcome-due",
        )
    })

    it("leaves it to an add while no device of the account is there, its own new leaf aside", () => {
        expect(joinStanding([leaf(bob, "b1"), leaf(me, "laptop", true)], me, "laptop")).toBe("not-added")
        expect(joinStanding([leaf(bob, "b1"), { credential: null, signatureKey: new Uint8Array(32) }], me, "laptop")).toBe(
            "not-added",
        )
    })
})

describe("joinFailure", () => {
    it("reads each refusal as what the join does next", () => {
        expect(joinFailure(new IdpError(409, "epoch_conflict", "taken"))).toBe("epoch-lost")
        expect(joinFailure(new IdpError(409, "epoch_not_next", "not next"))).toBe("epoch-lost")
        expect(joinFailure(new IdpError(403, "approval_required", "not approved"))).toBe("refused")
        expect(joinFailure(new IdpError(403, "access_denied", "not a member of this conversation"))).toBe("refused")
        expect(joinFailure(new IdpError(404, "not_found", "conversation not found"))).toBe("refused")
        expect(joinFailure(new IdpError(403, "device_required", "name it first"))).toBe("not-yet")
        expect(joinFailure(new IdpError(401, "invalid_token", "expired"))).toBe("not-yet")
        expect(joinFailure(new IdpError(429, "too_many_requests", "slow down"))).toBe("not-yet")
        expect(joinFailure(new IdpError(503, "unavailable", "down"))).toBe("unanswered")
        expect(joinFailure(new TypeError("Failed to fetch"))).toBe("unanswered")
    })

    it("tries again later on a growing delay", () => {
        expect([0, 1, 2, 3, 4, 9].map(joinRetryDelay)).toEqual([...JOIN_RETRY_MS, JOIN_RETRY_MS[4]])
    })
})

/** An engine answering `outcomes` in turn, a clock moved by hand, and the timers it fires. */
function harness(outcomes: (ConversationJoin | Error)[], devices: DeviceListEntry[] = [device("laptop")]) {
    let now = NOW
    const timers: { at: number; run: () => void; live: boolean }[] = []
    const held = new Set<ConversationId>()
    const heldListeners = new Set<(id: ConversationId) => void>()
    const calls: { conversationId: ConversationId; options: { welcomeOverdue: boolean; siblingMayAdd: boolean } }[] = []
    const e2ee = {
        joinConversation: async (
            _idpUrl: string,
            _token: string,
            conversationId: ConversationId,
            options: { welcomeOverdue: boolean; siblingMayAdd: boolean },
        ): Promise<ConversationJoin> => {
            calls.push({ conversationId, options })
            const next = outcomes.shift() ?? { kind: "not-added" }
            if (next instanceof Error) throw next
            if (next.kind === "joined") hold(conversationId)
            return next
        },
        heldGroups: async () => [...held],
        onGroupHeld: (listener: (id: ConversationId) => void) => {
            heldListeners.add(listener)
            return () => heldListeners.delete(listener)
        },
        getDeviceId: async () => "laptop",
    }
    function hold(conversationId: ConversationId) {
        held.add(conversationId)
        for (const listener of heldListeners) listener(conversationId)
    }
    const joins = new ConversationJoins({
        e2ee,
        deviceDirectory: { listDevices: async () => ({ devices }) },
        now: () => now,
        after: (ms, run) => {
            const timer = { at: now + ms, run, live: true }
            timers.push(timer)
            return () => (timer.live = false)
        },
    })
    const context: JoinContext = { idpUrl: "https://idp.test", accessToken: () => "tok" }
    const settled = () => new Promise((resolve) => setTimeout(resolve, 0))
    async function pass(ms: number) {
        now += ms
        for (const timer of timers.filter((t) => t.live && t.at <= now)) {
            timer.live = false
            timer.run()
        }
        await settled()
    }
    return { joins, context, calls, hold, pass, settled, pending: () => timers.filter((t) => t.live).map((t) => t.at - now) }
}

const list = (...ids: string[]) => ids.map((id) => ({ id, removedAt: null }))

describe("ConversationJoins", () => {
    it("sends nothing while no conversation is missing", async () => {
        const { joins, context, calls, hold } = harness([])
        hold("dm")

        await joins.sync(context, list("dm"))

        expect(calls).toEqual([])
    })

    it("joins at once with no sibling online, and a send waiting on it goes", async () => {
        const { joins, context, calls } = harness([{ kind: "joined" }])

        const entering = joins.whenIn(context, "dm")

        await expect(entering).resolves.toBe("in")
        expect(calls).toEqual([{ conversationId: "dm", options: { welcomeOverdue: false, siblingMayAdd: false } }])
    })

    it("leaves an online sibling the minute to add it, then joins: the send waits all along", async () => {
        const { joins, context, calls, pass, pending } = harness(
            [{ kind: "left-to-sibling" }, { kind: "joined" }],
            [device("laptop"), device("phone")],
        )
        let entered: string | null = null
        void joins.whenIn(context, "group").then((way) => (entered = way))
        await pass(0)

        expect(calls[0].options).toEqual({ welcomeOverdue: false, siblingMayAdd: true })
        expect(pending()).toEqual([WELCOME_WAIT_MS])
        await pass(WELCOME_WAIT_MS - 1)
        expect(entered).toBeNull()

        await pass(1)

        expect(calls[1].options).toEqual({ welcomeOverdue: false, siblingMayAdd: false })
        expect(entered).toBe("in")
    })

    it("is settled by the sibling's Welcome, sending nothing when its minute is up", async () => {
        const { joins, context, calls, hold, pass, pending } = harness([{ kind: "left-to-sibling" }], [device("laptop"), device("phone")])
        const entering = joins.whenIn(context, "group")
        await pass(0)

        hold("group")

        await expect(entering).resolves.toBe("in")
        expect(pending()).toEqual([])
        await pass(WELCOME_WAIT_MS)
        expect(calls).toHaveLength(1)
    })

    it("leaves a Welcome on its way its minute from when the tree first named the device, then joins over it", async () => {
        const { joins, context, calls, pass } = harness([
            { kind: "not-added" },
            { kind: "welcome-due" },
            { kind: "welcome-due" },
            { kind: "joined" },
        ])
        await joins.sync(context, list("group"))
        await pass(120_000)
        await joins.sync(context, list("group"))
        await pass(30_000)
        await joins.sync(context, list("group"))

        await pass(30_000)

        expect(calls.map((c) => c.options.welcomeOverdue)).toEqual([false, false, false, true])
    })

    it("answers a send `no-group` while the conversation has none, and looks again at the next", async () => {
        const { joins, context, calls } = harness([{ kind: "no-group" }, { kind: "no-group" }])

        await expect(joins.whenIn(context, "dm")).resolves.toBe("no-group")
        await expect(joins.whenIn(context, "dm")).resolves.toBe("no-group")
        expect(calls).toHaveLength(2)
    })

    it("fails what waits once refused for good, and tries nothing more this page load", async () => {
        const refusal = new IdpError(403, "approval_required", "not approved")
        const { joins, context, calls } = harness([{ kind: "refused", error: refusal }])

        await expect(joins.whenIn(context, "dm")).rejects.toBe(refusal)
        await joins.sync(context, list("dm"))
        await expect(joins.whenIn(context, "dm")).rejects.toBe(refusal)
        expect(calls).toHaveLength(1)
    })

    it("tries a failure again on the retry delays, the send waiting", async () => {
        const { joins, context, calls, pass, pending } = harness([new TypeError("Failed to fetch"), new Error("again"), { kind: "joined" }])
        let entered: string | null = null
        void joins.whenIn(context, "dm").then((way) => (entered = way))
        await pass(0)

        expect(pending()).toEqual([JOIN_RETRY_MS[0]])
        await pass(JOIN_RETRY_MS[0])
        expect(pending()).toEqual([JOIN_RETRY_MS[1]])
        await pass(JOIN_RETRY_MS[1])

        expect(calls).toHaveLength(3)
        expect(entered).toBe("in")
    })

    it("runs one join of a conversation at a time, however many ask", async () => {
        const { joins, context, calls } = harness([{ kind: "joined" }])

        await Promise.all([joins.whenIn(context, "dm"), joins.whenIn(context, "dm"), joins.sync(context, list("dm"))])

        expect(calls).toHaveLength(1)
    })
})

describe("enterConversationUseCase", () => {
    const context: JoinContext = { idpUrl: "https://idp.test", accessToken: () => "tok" }

    it("founds a DM with no group yet, and nothing for one held", async () => {
        const founded: string[] = []
        const e2ee = { ensureGroupExists: async (_i: string, _t: string, id: ConversationId) => void founded.push(id) }

        await enterConversationUseCase({ whenIn: async () => "no-group" }, e2ee, context, { id: "dm", peer: bob })
        await enterConversationUseCase({ whenIn: async () => "in" }, e2ee, context, { id: "held", peer: bob })

        expect(founded).toEqual(["dm"])
    })

    it("waits for the join instead when another device founded the DM meanwhile", async () => {
        const ways: ("in" | "no-group")[] = ["no-group", "in"]
        const e2ee = {
            ensureGroupExists: async (_i: string, _t: string, id: ConversationId) => {
                throw new GroupToJoin(id)
            },
        }

        await enterConversationUseCase({ whenIn: async () => ways.shift()! }, e2ee, context, { id: "dm", peer: bob })

        expect(ways).toEqual([])
    })

    it("founds no group: a group without one fails the send", async () => {
        await expect(
            enterConversationUseCase({ whenIn: async () => "no-group" }, { ensureGroupExists: async () => {} }, context, {
                id: "group",
                peer: null,
            }),
        ).rejects.toThrow("No MLS group")
    })
})
