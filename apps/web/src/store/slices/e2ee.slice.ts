import type { StateCreator } from "zustand"

import type { ActorUri, Fingerprint } from "@pinai/domain/models/e2ee"

import type { AppStore } from "../store"

/**
 * Cache of MSK fingerprints, keyed by federation `actor_uri`. The
 * verification UI's first-contact pin lives here too — once we've
 * seen a fingerprint we keep it; future fetches compare against the
 * pinned value and trigger an "identity changed" warning on mismatch
 * (Phase 6 wires the warning UI).
 *
 * Seeded by `useFingerprint` on first read; cleared on logout.
 */
export interface E2eeSlice {
    fingerprintsByActorUri: Record<ActorUri, Fingerprint>

    setFingerprint: (actorUri: ActorUri, fingerprint: Fingerprint) => void
    clearFingerprints: () => void
}

export const createE2eeSlice: StateCreator<
    AppStore,
    [["zustand/devtools", never]],
    [],
    E2eeSlice
> = (set) => ({
    fingerprintsByActorUri: {},

    setFingerprint: (actorUri, fingerprint) =>
        set(
            (s) => ({
                fingerprintsByActorUri: {
                    ...s.fingerprintsByActorUri,
                    [actorUri]: fingerprint,
                },
            }),
            false,
            "e2ee/setFingerprint",
        ),

    clearFingerprints: () => set({ fingerprintsByActorUri: {} }, false, "e2ee/clearFingerprints"),
})
