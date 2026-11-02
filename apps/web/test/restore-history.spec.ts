import { describe, expect, it, vi } from "vitest"

import { archivedEdit, archivedText, type ArchivedEntry } from "@pinai/domain/models/history-archive"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"

const PASSPHRASE = [
    "abandon", "ability", "able", "about", "above", "absent",
    "absorb", "abstract", "absurd", "abuse", "access", "accident",
    "account", "accuse", "achieve", "acid", "acoustic", "acquire",
    "across", "act", "action", "actor", "actress", "actual",
]

const ALICE = { address: "alice@idp.test", displayName: "Alice" }

function portRestoring(entries: ArchivedEntry[], skipped = 0): IE2eePort {
    return {
        restoreHistoryFromPassphrase: vi.fn().mockResolvedValue({ entries, skipped }),
    } as unknown as IE2eePort
}

describe("restoreHistoryFromPassphraseUseCase", () => {
    it("gives the archive back as messages, with what it decrypted and skipped", async () => {
        const port = portRestoring(
            [
                {
                    conversationId: "c1",
                    id: "m1",
                    envelope: archivedText(ALICE, "2026-11-01T10:00:00Z", { text: "hi" }, undefined),
                },
                {
                    conversationId: "c1",
                    id: "e1",
                    envelope: archivedEdit(ALICE, "2026-11-01T10:05:00Z", {
                        target_message_id: "m1",
                        new_text: "hello",
                    }),
                },
            ],
            1,
        )
        const result = await restoreHistoryFromPassphraseUseCase({ e2eePort: port })({
            idpUrl: "https://idp",
            accessToken: "tok",
            passphrase: PASSPHRASE,
        })
        expect(result.decrypted).toBe(2)
        expect(result.skipped).toBe(1)
        expect(result.messages).toHaveLength(1)
        expect(result.messages[0]).toMatchObject({ id: "m1", text: "hello", edited: true })
        expect(port.restoreHistoryFromPassphrase).toHaveBeenCalledWith("https://idp", "tok", PASSPHRASE)
    })

    it("propagates port errors", async () => {
        const port = {
            restoreHistoryFromPassphrase: vi.fn().mockRejectedValue(new Error("network")),
        } as unknown as IE2eePort
        await expect(
            restoreHistoryFromPassphraseUseCase({ e2eePort: port })({
                idpUrl: "https://idp",
                accessToken: "tok",
                passphrase: PASSPHRASE,
            }),
        ).rejects.toThrow("network")
    })
})
