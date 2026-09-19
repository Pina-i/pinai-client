/**
 * Use case test for Phase 6a's first-device bootstrap orchestration.
 *
 * After Phase 6a's dedup-at-the-adapter rework, the use case is a
 * thin wrapper around `IE2eePort.bootstrapFirstDevice`. The
 * orchestration (register → mnemonic → setupRecoveryKey →
 * saveStoredPassphrase) lives on the adapter where the singleton
 * `bootstrapPromise` cache can dedupe StrictMode's concurrent calls
 * — see `bootstrap-first-device.usecase.ts` for the rationale. This
 * file asserts the wrapper passes args through verbatim and surfaces
 * errors unchanged.
 */
import { describe, expect, it, vi } from "vitest"

import type { ActorUri } from "@/domain/models/e2ee"
import { asActorUri } from "@/domain/models/identity"
import type { KeyPackageStatusResponse } from "@/domain/models/e2ee"
import type { IE2eePort } from "@/domain/ports/e2ee.port"
import { bootstrapFirstDeviceUseCase } from "@/domain/usecases/e2ee/bootstrap-first-device.usecase"

const IDP_URL = "https://idp.example"
const TOKEN = "test-token"
const ACTOR: ActorUri = asActorUri("https://idp.example/users/alice_xK9mP")

const EMPTY_KEY_PACKAGE_STATUS: KeyPackageStatusResponse = {
    devices: [],
    refill_threshold: 0,
    cap: 0,
}

function buildPort(
    bootstrapImpl: IE2eePort["bootstrapFirstDevice"],
): IE2eePort {
    return {
        bootstrapFirstDevice: bootstrapImpl,
        // Unused stubs — declared so the type check passes.
        register: async () => {
            throw new Error("register not stubbed")
        },
        setupRecoveryKey: async () => {
            throw new Error("setupRecoveryKey not stubbed")
        },
        saveStoredPassphrase: async () => undefined,
        hasLocalIdentity: async () => false,
        getBoundActorUri: async () => null,
        wipeLocalDevice: async () => undefined,
        loadStoredPassphrase: async () => null,
        clearRecoveryKey: async () => undefined,
        hasRecoveryKey: async () => false,
        getOwnFingerprint: async () => null,
        getPeerFingerprint: async () => null,
        encryptOutbound: async () => {
            throw new Error("encryptOutbound not stubbed")
        },
        decryptInbound: async () => null,
        addContactToGroup: async () => undefined,
        ensureGroupExists: async () => undefined,
        consumePendingWelcomes: async () => ({ joined: 0 }),
        replenishKeyPackages: async () => EMPTY_KEY_PACKAGE_STATUS,
        recoverFromPassphrase: async () => {
            throw new Error("recoverFromPassphrase not stubbed")
        },
        revokeDevice: async () => ({ removed_from: [] }),
        startPairingAsInitiator: async () => {
            throw new Error("startPairingAsInitiator not stubbed")
        },
        pairAsResponder: async () => {
            throw new Error("pairAsResponder not stubbed")
        },
        registerDevice: async () => undefined,
        getDeviceId: async () => "device-0000-0000-0000-000000000000",
        getCachedPassphrase: async () => null,
        bufferDecryptedForArchive: () => undefined,
        startFlushing: () => undefined,
        stopFlushing: () => undefined,
        restoreHistoryFromPassphrase: async () => ({ restored: 0, skipped: 0 }),
        clearHistoryBackup: async () => undefined,
    }
}

describe("bootstrapFirstDeviceUseCase", () => {
    it("forwards idpUrl, accessToken, actorUri to the port and returns its result", async () => {
        const fakeResult = {
            device_id: "device-1234-5678-9abc-def012345678",
            fingerprint:
                "FP01-FP02-FP03-FP04-FP05-FP06-FP07-FP08-FP09-FP10-FP11-FP12",
            words: Array.from({ length: 24 }, (_, i) => `word-${i + 1}`),
        }
        const spy = vi.fn(async () => fakeResult)
        const port = buildPort(spy)

        const result = await bootstrapFirstDeviceUseCase({ e2eePort: port })({
            idpUrl: IDP_URL,
            accessToken: TOKEN,
            actorUri: ACTOR,
        })

        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(IDP_URL, TOKEN, ACTOR)
        expect(result).toEqual(fakeResult)
    })

    it("propagates errors from the port unchanged", async () => {
        const port = buildPort(async () => {
            throw new Error("network down")
        })
        await expect(
            bootstrapFirstDeviceUseCase({ e2eePort: port })({
                idpUrl: IDP_URL,
                accessToken: TOKEN,
                actorUri: ACTOR,
            }),
        ).rejects.toThrow(/network down/)
    })
})
