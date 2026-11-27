/**
 * What every Argon2id the E2EE core is given answers (`@pinai/crypto/argon2`): known answers, byte for byte — a
 * phone that derived another key from the same words could never read what the web archived. Played on @noble by
 * `apps/web/test/argon2-contract.spec.ts`, on the native library by the mobile app's `/dev/argon2-check`.
 */

import { type ContractScenario, hex, refused, same, utf8 } from "@pinai/domain/lib/contract"
import type { Argon2id, Argon2Params } from "../../argon2"

export type MakeArgon2id = () => Promise<Argon2id>

export type Argon2Scenario = ContractScenario<MakeArgon2id>

const bytes = (seed: number, length: number): Uint8Array => Uint8Array.from({ length }, (_, i) => (seed + i) % 256)

interface KnownAnswer {
    readonly what: string
    readonly password: Uint8Array
    readonly salt: Uint8Array
    readonly params: Argon2Params
    readonly answer: string
}

const KNOWN_ANSWERS: readonly KnownAnswer[] = [
    {
        what: "the reference implementation's vector",
        password: utf8("password"),
        salt: utf8("somesalt"),
        params: { t: 2, m: 1 << 16, p: 1, dkLen: 32 },
        answer: "09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7",
    },
    {
        what: "a small setting",
        password: utf8("pinai"),
        salt: bytes(1, 16),
        params: { t: 1, m: 64, p: 1, dkLen: 32 },
        answer: "d78f242817b1a3e251a1c16b85731d9f78838bf7415d4051d7a0cbe40892bf7d",
    },
    {
        what: "the 24 words' setting (64 MiB, 3 passes, 4 lanes)",
        password: utf8(
            "lagoon basalt tiare ripple pandanus ember coral thatch monsoon hibiscus kernel drift reef amber canoe shoal plait current frond cinder atoll vessel tideline echo"
        ),
        salt: bytes(16, 16),
        params: { t: 3, m: 64 * 1024, p: 4, dkLen: 32 },
        answer: "9a8b731f3a83065746792ad3a2af36d969636c1864d4903ca099a375b2925470",
    },
    {
        what: "the approval code's setting (19 MiB, 2 passes, 40 bytes)",
        password: utf8("042137"),
        salt: utf8("PINAI-APPROVAL-CODE-v1\n0f1e2d3c-4b5a-4978-8796-a5b4c3d2e1f0"),
        params: { t: 2, m: 19 * 1024, p: 1, dkLen: 40 },
        answer: "cbbfa72eefbe48ca56cbaede330de87e52ea6de44d465f4b32422e8adda25d8079bfb29e41f51f15",
    },
]

export const ARGON2_SCENARIOS: readonly Argon2Scenario[] = [
    ...KNOWN_ANSWERS.map((known): Argon2Scenario => ({
        name: `gives ${known.what}`,
        async run(make) {
            const argon2id = await make()
            same(await argon2id(known.password, known.salt, known.params), hex(known.answer), `${known.what} is answered`)
        },
    })),
    {
        name: "leaves its inputs as they were, and answers an array of its own",
        async run(make) {
            const argon2id = await make()
            const password = utf8("pinai")
            const salt = bytes(1, 16)
            const params = { t: 1, m: 64, p: 1, dkLen: 32 }

            const first = await argon2id(password, salt, params)
            same(password, utf8("pinai"), "the password is untouched")
            same(salt, bytes(1, 16), "the salt is untouched")
            first.fill(0)
            same(await argon2id(password, salt, params), hex(KNOWN_ANSWERS[1].answer), "zeroing one answer changes the next none")
        },
    },
    {
        name: "refuses a setting Argon2 doesn't allow",
        async run(make) {
            const argon2id = await make()
            await refused(() => argon2id(utf8("pinai"), bytes(1, 16), { t: 1, m: 4, p: 1, dkLen: 32 }), "less memory than 8 KiB a lane")
            await refused(() => argon2id(utf8("pinai"), bytes(1, 16), { t: 0, m: 64, p: 1, dkLen: 32 }), "no pass at all")
        },
    },
]
