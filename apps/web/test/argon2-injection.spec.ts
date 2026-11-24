import { describe, expect, it } from "vitest"

import type { Argon2id, Argon2Params } from "@pinai/crypto/argon2"
import { codeScalar } from "@pinai/crypto/approval-handshake"
import { HistoryArchiveAdapter } from "@pinai/crypto/history-archive.adapter"

function recording(): { argon2id: Argon2id; calls: { password: string; params: Argon2Params }[] } {
    const calls: { password: string; params: Argon2Params }[] = []
    const argon2id: Argon2id = async (password, _salt, params) => {
        calls.push({ password: new TextDecoder().decode(password), params })
        return new Uint8Array(params.dkLen).fill(7)
    }
    return { argon2id, calls }
}

describe("the Argon2id @pinai/crypto is given", () => {
    it("derives the History Archive Key from the words at the archive's setting", async () => {
        const { argon2id, calls } = recording()

        const hak = await new HistoryArchiveAdapter(argon2id).deriveKey(["Lagoon ", " basalt"], new Uint8Array(16))

        expect(calls).toEqual([{ password: "lagoon basalt", params: { t: 3, m: 64 * 1024, p: 4, dkLen: 32 } }])
        expect(hak).toEqual(new Uint8Array(32).fill(7))
    })

    it("draws an approval code's scalar at the handshake's setting", async () => {
        const { argon2id, calls } = recording()

        await codeScalar("042137", "0F1E2D3C-4B5A-4978-8796-A5B4C3D2E1F0", argon2id)

        expect(calls).toEqual([{ password: "042137", params: { t: 2, m: 19 * 1024, p: 1, dkLen: 40 } }])
    })
})
