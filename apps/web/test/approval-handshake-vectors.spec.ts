/**
 * The code handshake byte for byte, against an independent implementation's run: code `042913` on
 * request `0190c7a2-0000-7000-8000-00000000abcd`, the scalars of RFC 9382's first vector, fixed
 * keys — w, then the five messages of § 3.10 as they cross the relay.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { ApprovalHandshake, codeScalar } from "@pinai/crypto/approval-handshake"
import { asActorUri } from "@pinai/domain/models/identity"

const hex = (text: string) => Uint8Array.from(text.match(/../g)!.map((b) => parseInt(b, 16)))
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

const ACTOR = asActorUri("https://idp.alice.test/users/alice_xk9mp")
const REQUEST = "0190c7a2-0000-7000-8000-00000000abcd"
const ASKER = "550e8400-e29b-41d4-a716-446655440000"
const ANSWERER = "660e8400-e29b-41d4-a716-446655440001"
const X = "43dd0fd7215bdcb482879fca3220c6a968e66d70b1356cac18bb26c84a78d729"
const Y = "dcb60106f276b02606d8ef0a328c02e4b629f84f89786af5befb0bc75b6e66be"

const W = "83141bc8c8c403e2e5e6e66fa0ad5ef9cf51e6e3592fa00027b688f2c8a6ebf6"
const MESSAGES = [
    "010104b37dfe17877c8ba8c8b13f01fba4927c20aaa928c572ec08caf7ede5410f3d0d9c8d5ce406a16cb13214a5e128a0a08b13e71b4a7681a5001b4418d512ed9131",
    "010204beefb078c1e056b696827f97692569af15455b09eccf6ccf36c1770c1c05483ea50301259d0faa4accde2312f64827ad94ffa97df2d79fe9831c53f893a474e9",
    "01032cb794cb77e1ce3a238f538d16dd97f7fc06aa7c74fec3f43a7576397bd9d33e",
    "0104e87aa4229cbe2509f16ea00a18c18d7c227aaf507613c92d2d34e9525506423316387bda1e6a0a18e6a5ca6ca0c065e12f1621867e48cff296758666d93fb4ae45e22c901afeb8cd2c508e143673434bd51951ae1e9d06b1e5f3fa27f76b677c084c3e59df92260f0eb87c52e916f2b6",
    "01058862ae0731c0b8c18313d4c63f44acea434d1ac0a081f3fe52cf8be98dfdaa5019a4585fc3f4691a112c7d72624ee23928d7a7e7db7a3adb6e6b6af46b0bf79a650f7a68b202dc88b5059b0b2dd77dc9",
]

const keysA = { rootKey: new Uint8Array(32).fill(0xa1), hpkeKey: new Uint8Array(32).fill(0xa2) }
const keysB = { rootKey: new Uint8Array(32).fill(0xb1), hpkeKey: new Uint8Array(32).fill(0xb2) }

afterEach(() => {
    vi.restoreAllMocks()
})

/** The next 32-byte draws are these scalars, in order. */
function scalarsDrawn(...scalars: string[]) {
    const queue = scalars.map(hex)
    const real = crypto.getRandomValues.bind(crypto)
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: Uint8Array) => {
        if (array instanceof Uint8Array && array.length === 32 && queue.length > 0) {
            array.set(queue.shift() as Uint8Array)
            return array
        }
        return real(array)
    }) as typeof crypto.getRandomValues)
}

describe("the code handshake's known answers", () => {
    it("gives w for the code on its request, whatever the case its id is written in", async () => {
        expect((await codeScalar("042913", REQUEST)).toString(16).padStart(64, "0")).toBe(W)
        expect((await codeScalar("042913", REQUEST.toUpperCase())).toString(16).padStart(64, "0")).toBe(W)
    })

    it("sends the five messages byte for byte, and each side ends with the other's keys", async () => {
        scalarsDrawn(X, Y)
        const asker = await ApprovalHandshake.start({
            role: "asker",
            requestId: REQUEST,
            actorUri: ACTOR,
            deviceId: ASKER,
            own: keysA,
            code: "042913",
            peerDeviceId: null,
        })
        const answerer = await ApprovalHandshake.start({
            role: "answerer",
            requestId: REQUEST,
            actorUri: ACTOR,
            deviceId: ANSWERER,
            own: keysB,
            code: "042913",
            peerDeviceId: ASKER,
        })
        vi.restoreAllMocks()

        const m1 = asker.opening() as Uint8Array
        const m2 = answerer.receive(m1, ASKER).reply as Uint8Array
        const m3 = asker.receive(m2, ANSWERER).reply as Uint8Array
        const m4 = answerer.receive(m3, ASKER).reply as Uint8Array
        const fourth = asker.receive(m4, ANSWERER)
        const fifth = answerer.receive(fourth.reply as Uint8Array, ASKER)

        expect([m1, m2, m3, m4, fourth.reply as Uint8Array].map(toHex)).toEqual(MESSAGES)
        expect(fourth.peerKeys).toEqual(keysB)
        expect(fifth.peerKeys).toEqual(keysA)
        expect(fifth.reply).toBeNull()
        // Done, each side takes nothing more: a message again is out of turn.
        expect(() => answerer.receive(fourth.reply as Uint8Array, ASKER)).toThrow()
        expect(() => asker.receive(m4, ANSWERER)).toThrow()
    })
})
