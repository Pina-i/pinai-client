/** `IDeviceKeyPort`: sealing bound to this device and account, failing closed. */

import { check, refused, same, utf8 } from "@pinai/domain/lib/contract"
import { bytes, LARGE } from "./fixtures"
import { ALICE, inWorld, PIERRE, type StorageScenario } from "./world"

export const DEVICE_KEY_SCENARIOS: readonly StorageScenario[] = [
    {
        name: "opens what it sealed: bytes, nothing at all, several megabytes",
        run: (make) =>
            inWorld(make, async (world) => {
                const { deviceKey } = world.open(ALICE)
                await deviceKey.ready()

                for (const plaintext of [bytes(1, 512), new Uint8Array(0), bytes(3, LARGE)]) {
                    same(await deviceKey.open(await deviceKey.seal(plaintext)), plaintext, `${plaintext.length} bytes open as sealed`)
                }
            }),
    },
    {
        name: "draws a fresh nonce per seal: the same input never seals the same twice",
        run: (make) =>
            inWorld(make, async (world) => {
                const { deviceKey } = world.open(ALICE)
                const a = await deviceKey.seal(utf8("the same message twice"))
                const b = await deviceKey.seal(utf8("the same message twice"))

                check(a.nonce.length !== b.nonce.length || a.nonce.some((byte, i) => byte !== b.nonce[i]), "two seals draw two nonces")
                check(
                    a.ciphertext.some((byte, i) => byte !== b.ciphertext[i]),
                    "two seals of the same input differ"
                )
            }),
    },
    {
        name: "refuses altered bytes, a cut tag and a wrong nonce",
        run: (make) =>
            inWorld(make, async (world) => {
                const { deviceKey } = world.open(ALICE)
                const sealed = await deviceKey.seal(utf8("secret"))

                const altered = Uint8Array.from(sealed.ciphertext)
                altered[0] ^= 0xff
                await refused(() => deviceKey.open({ ciphertext: altered, nonce: sealed.nonce }), "an altered ciphertext")
                await refused(() => deviceKey.open({ ciphertext: sealed.ciphertext.slice(0, -1), nonce: sealed.nonce }), "a ciphertext cut short")
                const nonce = Uint8Array.from(sealed.nonce)
                nonce[0] ^= 0xff
                await refused(() => deviceKey.open({ ciphertext: sealed.ciphertext, nonce }), "a wrong nonce")
                same(await deviceKey.open(sealed), utf8("secret"), "the untouched seal still opens")
            }),
    },
    {
        name: "refuses what another account's key sealed",
        run: (make) =>
            inWorld(make, async (world) => {
                const sealed = await world.open(ALICE).deviceKey.seal(utf8("alice's"))

                await refused(() => world.open(PIERRE).deviceKey.open(sealed), "another account's seal")
            }),
    },
    {
        name: "opens, in a new instance, what an earlier one sealed",
        run: (make) =>
            inWorld(make, async (world) => {
                const sealed = await world.open(ALICE).deviceKey.seal(utf8("kept"))

                same(await world.open(ALICE).deviceKey.open(sealed), utf8("kept"), "the key outlives the instance that made it")
            }),
    },
    {
        name: "mints one key when first used twice at once",
        run: (make) =>
            inWorld(make, async (world) => {
                const { deviceKey } = world.open(ALICE)
                const [a, b] = await Promise.all([deviceKey.seal(utf8("a")), deviceKey.seal(utf8("b"))])

                const later = world.open(ALICE).deviceKey
                same(await later.open(a), utf8("a"), "the first of two racing seals opens later")
                same(await later.open(b), utf8("b"), "the second of two racing seals opens later")
            }),
    },
    {
        name: "after a wipe, opens nothing sealed before, and seals again",
        run: (make) =>
            inWorld(make, async (world) => {
                const { deviceKey } = world.open(ALICE)
                const before = await deviceKey.seal(utf8("before"))
                await deviceKey.wipe()

                await refused(() => deviceKey.open(before), "a seal from before the wipe")
                const after = await deviceKey.seal(utf8("after"))
                same(await deviceKey.open(after), utf8("after"), "a seal after the wipe opens")
                const later = world.open(ALICE).deviceKey
                await refused(() => later.open(before), "a seal from before the wipe, in a new instance")
                same(await later.open(after), utf8("after"), "a seal after the wipe opens in a new instance")
            }),
    },
]
