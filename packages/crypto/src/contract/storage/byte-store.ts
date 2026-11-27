/** `IKeyValueStore`: bytes in, the same bytes out, per collection and per account. */

import { check, same } from "@pinai/domain/lib/contract"
import { bytes, LARGE } from "./fixtures"
import { ALICE, inWorld, PIERRE, type StorageScenario } from "./world"

export const BYTE_STORE_SCENARIOS: readonly StorageScenario[] = [
    {
        name: "reads back what it wrote, and nothing where nothing was written",
        run: (make) =>
            inWorld(make, async (world) => {
                const { kv } = world.open(ALICE)
                await kv.put("identity", "a", bytes(1))

                const read = await kv.get("identity", "a")
                check(read !== undefined, "a row written reads back")
                same(read, bytes(1), "a row reads back as written")
                check((await kv.get("identity", "missing")) === undefined, "a key never written reads as nothing")
                check((await kv.get("mls_snapshot", "a")) === undefined, "a key written in one collection is not in another")
            }),
    },
    {
        name: "keeps two collections apart under the same key",
        run: (make) =>
            inWorld(make, async (world) => {
                const { kv } = world.open(ALICE)
                await kv.put("identity", "k", bytes(1))
                await kv.put("mls_snapshot", "k", bytes(2))
                await kv.delete("identity", "k")

                check((await kv.get("identity", "k")) === undefined, "the deleted row is gone")
                const other = await kv.get("mls_snapshot", "k")
                check(other !== undefined, "the other collection's row stays")
                same(other, bytes(2), "the other collection's row is its own")
            }),
    },
    {
        name: "replaces a row written again, deletes one, and takes the delete of a row that isn't there",
        run: (make) =>
            inWorld(make, async (world) => {
                const { kv } = world.open(ALICE)
                await kv.put("identity", "a", bytes(1))
                await kv.put("identity", "a", bytes(2, 8))

                const read = await kv.get("identity", "a")
                check(read !== undefined, "a row written twice reads back")
                same(read, bytes(2, 8), "a row written twice reads as the second write")
                await kv.delete("identity", "a")
                check((await kv.get("identity", "a")) === undefined, "a deleted row reads as nothing")
                await kv.delete("identity", "never-written")
            }),
    },
    {
        name: "keeps what was written, whatever happens to the arrays after",
        run: (make) =>
            inWorld(make, async (world) => {
                const { kv } = world.open(ALICE)
                const written = bytes(1)
                await kv.put("identity", "a", written)
                written[0] ^= 0xff

                const first = await kv.get("identity", "a")
                check(first !== undefined, "the row reads back")
                same(first, bytes(1), "changing the written array changes nothing stored")
                first[1] ^= 0xff
                const second = await kv.get("identity", "a")
                check(second !== undefined, "the row reads back again")
                same(second, bytes(1), "changing a read array changes nothing stored")
            }),
    },
    {
        name: "carries a value of several megabytes whole",
        run: (make) =>
            inWorld(make, async (world) => {
                const { kv } = world.open(ALICE)
                await kv.put("mls_snapshot", "large", bytes(7, LARGE))

                const read = await kv.get("mls_snapshot", "large")
                check(read !== undefined, "a large row reads back")
                same(read, bytes(7, LARGE), "a large row reads back whole")
            }),
    },
    {
        name: "clears every row of every collection",
        run: (make) =>
            inWorld(make, async (world) => {
                const { kv } = world.open(ALICE)
                await kv.put("identity", "a", bytes(1))
                await kv.put("mls_snapshot", "b", bytes(2))
                await kv.put("recovery_passphrase", "c", bytes(3))
                await kv.clear()

                for (const [collection, key] of [
                    ["identity", "a"],
                    ["mls_snapshot", "b"],
                    ["recovery_passphrase", "c"],
                ]) {
                    check((await kv.get(collection, key)) === undefined, `${collection} is empty after a clear`)
                }
            }),
    },
    {
        name: "shows a new instance what an earlier one wrote, and another account none of it",
        run: (make) =>
            inWorld(make, async (world) => {
                await world.open(ALICE).kv.put("identity", "a", bytes(1))

                const again = await world.open(ALICE).kv.get("identity", "a")
                check(again !== undefined, "a new instance reads what an earlier one wrote")
                same(again, bytes(1), "a new instance reads the same bytes")
                check((await world.open(PIERRE).kv.get("identity", "a")) === undefined, "another account's store holds none of it")
            }),
    },
]
