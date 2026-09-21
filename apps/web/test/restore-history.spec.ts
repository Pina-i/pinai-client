import { describe, expect, it, vi } from "vitest"

import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"

const PASSPHRASE = [
    "abandon", "ability", "able", "about", "above", "absent",
    "absorb", "abstract", "absurd", "abuse", "access", "accident",
    "account", "accuse", "achieve", "acid", "acoustic", "acquire",
    "across", "act", "action", "actor", "actress", "actual",
]

describe("restoreHistoryFromPassphraseUseCase", () => {
    it("returns the count of restored + skipped entries", async () => {
        const port = {
            restoreHistoryFromPassphrase: vi
                .fn()
                .mockResolvedValue({ restored: 5, skipped: 1 }),
        } as unknown as IE2eePort
        const result = await restoreHistoryFromPassphraseUseCase({ e2eePort: port })({
            idpUrl: "https://idp",
            accessToken: "tok",
            passphrase: PASSPHRASE,
        })
        expect(result).toEqual({ restored: 5, skipped: 1 })
        expect(port.restoreHistoryFromPassphrase).toHaveBeenCalledWith(
            "https://idp",
            "tok",
            PASSPHRASE,
        )
    })

    it("propagates port errors", async () => {
        const port = {
            restoreHistoryFromPassphrase: vi
                .fn()
                .mockRejectedValue(new Error("network")),
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
