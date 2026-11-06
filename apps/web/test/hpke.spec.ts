/**
 * HPKE through the real bundle, as `@pinai/mls` hands it out: the suite key shares are sealed
 * with (`identity-provider/specs/e2ee.md § 3.11`), checked against RFC 9180's vector for it
 * (A.1.1, base mode). `cargo test` checks the key derivation against the same vector.
 */
import { beforeAll, describe, expect, it } from "vitest"

import { MlsAdapter } from "@pinai/mls/wasm.adapter"

import { loadWasmModule } from "./setup/wasm"

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)))
// Copied into this realm's `Uint8Array`, which is what the bundle answers in.
const utf8 = (s: string) => Uint8Array.from(new TextEncoder().encode(s))

/** RFC 9180 A.1.1: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM, sequence number 0. */
const VECTOR = {
    info: hex("4f6465206f6e2061204772656369616e2055726e"),
    skRm: hex("4612c550263fc8ad58375df3f557aac531d26850903e55a9f23f21d8534e8ac8"),
    pkRm: hex("3948cfe0ad1ddb695d780e59077195da6c56506b027329794ab02bca80815c4d"),
    enc: hex("37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431"),
    aad: hex("436f756e742d30"),
    pt: hex("4265617574792069732074727574682c20747275746820626561757479"),
    ct: hex(
        "f938558b5d72f1a23810b4be2ab4f84331acc02fc97babc53a52ae8218a355a96d8770ac83d07bea87e13c512a",
    ),
}

let hpke: MlsAdapter

beforeAll(async () => {
    hpke = new MlsAdapter()
    await hpke.initialize({ module_or_path: await loadWasmModule() } as never)
})

describe("HPKE (DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM, base mode)", () => {
    it("opens the RFC's ciphertext to its plaintext", async () => {
        const opened = await hpke.open(VECTOR.skRm, { enc: VECTOR.enc, ciphertext: VECTOR.ct }, VECTOR.info, VECTOR.aad)

        expect(opened).toEqual(VECTOR.pt)
    })

    it("opens it under its own info and aad only", async () => {
        const sealed = { enc: VECTOR.enc, ciphertext: VECTOR.ct }

        await expect(hpke.open(VECTOR.skRm, sealed, utf8("pinai/history-key-share/v1"), VECTOR.aad)).rejects.toThrow()
        await expect(hpke.open(VECTOR.skRm, sealed, VECTOR.info, utf8("another aad"))).rejects.toThrow()
    })

    it("seals to the RFC's recipient key what its private key opens", async () => {
        const sealed = await hpke.seal(VECTOR.pkRm, VECTOR.info, VECTOR.aad, VECTOR.pt)

        expect(sealed.enc).toHaveLength(32)
        expect(sealed.ciphertext).toHaveLength(VECTOR.pt.length + 16)
        expect(await hpke.open(VECTOR.skRm, sealed, VECTOR.info, VECTOR.aad)).toEqual(VECTOR.pt)
    })

    it("makes key pairs whose public half takes seals only their private half opens", async () => {
        const [mine, theirs] = [await hpke.generateKeyPair(), await hpke.generateKeyPair()]
        const words = utf8("abandon ability able about above absent absorb abstract")

        const sealed = await hpke.seal(mine.publicKey, utf8("info"), utf8("aad"), words)

        expect(mine.publicKey).toHaveLength(32)
        expect(mine.publicKey).not.toEqual(theirs.publicKey)
        expect(await hpke.open(mine.privateKey, sealed, utf8("info"), utf8("aad"))).toEqual(words)
        await expect(hpke.open(theirs.privateKey, sealed, utf8("info"), utf8("aad"))).rejects.toThrow()
    })

    it("refuses to seal to a low-order key", async () => {
        await expect(hpke.seal(new Uint8Array(32), utf8("info"), utf8("aad"), utf8("secret"))).rejects.toThrow()
    })
})
