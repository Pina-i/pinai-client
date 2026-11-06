import type {
    ActorUri,
    ApplicationMessage,
    ConversationId,
    DeviceId,
    Fingerprint,
    KeyPackageStatusResponse,
} from "../models/e2ee"
import type { Admission, CheckedPartner, ResetSetter } from "../models/admission"
import type { ExchangedKeys, HandshakeRole } from "../models/approval-handshake"
import type { DeviceListEntry } from "../models/device"
import type { BaselineIntent, DeviceTrustVerdict, HandshakeKeysRefusal, HandshakePartner, TrustEvent } from "../models/device-trust"
import type { ArchiveEnvelope, ArchivedEntry } from "../models/history-archive"
import type { DerivedHistoryKey, HistoryKey, HistoryKeyStanding, PendingHistoryKey } from "../models/history-key"
import type { RearchiveDue, RearchiveEntry, RearchivePosition } from "../models/history-rearchive"
import type { KeyShare, KeyShareRefusal, OutgoingKeyShare } from "../models/key-share"
import type { ArchiveEntry } from "./history-archive.port"

/**
 * High-level, transport-agnostic E2EE operations the rest of the app
 * uses. The implementation lives in `adapters/e2ee/` and stitches
 * together the MLS engine (`openmls-wasm`), per-user identity keys,
 * IndexedDB persistence, and the IdP REST surface.
 *
 * The presentation layer only ever talks to this port — never directly
 * to the WASM bundle or the key-directory REST endpoints.
 */
export interface IE2eePort {
    /**
     * Registers the device, binds its leaf credential to this account and tops its KeyPackage stash
     * up to the first batch. Publishing makes the device addable to conversations: only
     * `registerIdentityUseCase` calls it, for a device that is in. Idempotent within a page load.
     */
    register(idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<{
        device_id: DeviceId
        fingerprint: Fingerprint
    }>

    /**
     * Cheap predicate the onboarding gate uses to decide whether to
     * probe the server or skip straight into the app. Returns true
     * when an identity bundle exists in IndexedDB for this device.
     */
    hasLocalIdentity(): Promise<boolean>

    /**
     * Returns the actor URI the local identity is bound to (set after
     * register) or null. The onboarding gate
     * uses this to detect cross-account contamination — Alice logging
     * out and Pierre logging back in on the same browser must NOT
     * have Pierre inherit Alice's keys.
     */
    getBoundActorUri(): Promise<ActorUri | null>

    /**
     * Returns this device's stable UUID. The Settings → Devices view uses
     * it to mark the current row — the server doesn't know which row is
     * the caller.
     */
    getDeviceId(): Promise<DeviceId>

    /**
     * Wipe every sealed row owned by this device — identity
     * bundle, MLS snapshot, recovery passphrase, meta (device key +
     * device id). Used by the gate when it detects a different user
     * has signed in on this browser. After this returns, the device
     * looks "fresh" to the next gate run.
     *
     * Best-effort: per-DB errors are swallowed because the worst
     * outcome is that the gate sees a partial state and retries.
     */
    wipeLocalDevice(): Promise<void>

    /**
     * Compute the local user's MSK fingerprint for the UI. Reads from
     * the identity bundle in IndexedDB; returns null if the user
     * hasn't called `register` yet on this device.
     */
    getOwnFingerprint(): Promise<Fingerprint | null>

    /** Legacy — returns null since per-device IdP attestation replaced peer MSK fingerprints. */
    getPeerFingerprint(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<Fingerprint | null>

    /**
     * Encrypt an `ApplicationMessage` for delivery. Returns the
     * TLS-encoded `MLSMessage` bytes ready to ship as
     * `mls_ciphertext` over `POST /api/dm`.
     *
     * Throws if the conversation has no MLS group state (the caller
     * must have `addContactToGroup`'d at least one peer first).
     */
    encryptOutbound(
        conversationId: ConversationId,
        message: ApplicationMessage,
    ): Promise<Uint8Array>

    /**
     * Decrypt an inbound `mls_ciphertext` blob. Returns the
     * `ApplicationMessage` plaintext on success; advances the local
     * group epoch on commits; appends to pending proposals on
     * proposals (returns `null` for both — caller treats it as "no
     * UI plaintext to render").
     *
     * When `catchUp` is supplied, decrypt failures (e.g. we're behind
     * by one or more commits) trigger a one-shot
     * `GET /api/mls/groups/:id/commits?since=:epoch` fetch, replay
     * each missing commit through `processMessage`, then retry the
     * original decrypt once. Without `catchUp`, the call is read-only
     * — useful when the caller doesn't have an access token at hand
     * (or wants to skip a surprise REST round-trip).
     */
    decryptInbound(
        conversationId: ConversationId,
        ciphertext: Uint8Array,
        catchUp?: { idpUrl: string; accessToken: string },
    ): Promise<ApplicationMessage | null>

    /**
     * Bring `actor_uri` into a conversation: claim a KeyPackage of each of their devices, build an
     * MLS Add commit + Welcome for each whose leaf verifies as that device's
     * (`identity-provider/specs/e2ee.md § 3.4`), deliver them through the IdP DS endpoints. If the
     * conversation has no group yet (first message), the group is created here. None that
     * verifies is `KeyPackageUnavailable`, nothing committed.
     */
    addContactToGroup(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        actorUri: ActorUri,
    ): Promise<void>

    /**
     * "I am about to send a message to `recipientActorUri` in
     * `conversationId` — make sure I have an MLS group state for it."
     * Idempotent: if the group already exists, returns immediately;
     * otherwise calls {@link IE2eePort.addContactToGroup} to claim a
     * KeyPackage, build the founding commit + welcome, and dispatch
     * them.
     */
    ensureGroupExists(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        recipientActorUri: ActorUri,
    ): Promise<void>

    /**
     * One-shot pull of every pending Welcome aimed at this device,
     * joining each group locally. Called on login + on
     * `MlsWelcomeReady` WS events. `actorUri` ensures the MLS
     * adapter's per-device identity is bound before joining.
     */
    consumePendingWelcomes(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ joined: number }>

    /**
     * Revoke another device of this user: the revocation is kept for good, then one MLS Remove
     * commit per leaf naming the device in each conversation; PCS recovers within each commit. The
     * caller passes the conversation list (typically every active DM/group from the local store)
     * so the port stays free of zustand.
     */
    revokeDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        deviceId: DeviceId,
        conversationIds: ConversationId[],
    ): Promise<{ removed_from: ConversationId[] }>

    /**
     * Commit out of a group's MLS state every leaf that isn't a device of someone `roster` — the
     * group's members as the IdP lists them — holds, so nothing sent from then on decrypts for them:
     * every device of someone gone, and every leaf whose credential names nobody or that a check of
     * `identity-provider/specs/e2ee.md § 3.4` shows forged. A commit that loses an epoch race is
     * dropped; the group catches up and is looked at again.
     */
    pruneGroup(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        roster: readonly string[],
    ): Promise<{ removed: number }>

    /**
     * Calls `listener` each time this device comes to hold a group — founded on a first send, or
     * joined from a Welcome — the moment the user's other devices can be brought into it. Answers
     * the unsubscribe.
     */
    onGroupHeld(listener: (conversationId: ConversationId) => void): () => void

    /**
     * Applies the commits the DS holds past this device's epoch, for a group it holds keys for:
     * a message encrypted at an epoch the others left is read by none of them.
     */
    catchUp(idpUrl: string, accessToken: string, conversationId: ConversationId): Promise<void>

    /**
     * Brings into a group this device holds keys for the devices `trust` found approved that no
     * verified leaf stands for (`devicesToAdd`), one device a commit, each with a KeyPackage of its
     * own whose leaf verifies as that device over the root key it was approved over. Nothing unless
     * `trust` acts under the generation this device still holds. A group this device doesn't hold
     * is left alone: founding one here would fork it. A commit that loses an epoch race is dropped;
     * the group catches up and is looked at again. Runs on one device take turns. `unclaimed`: the
     * devices left out because no KeyPackage of theirs could be claimed — a stash not yet published.
     */
    addOwnDevices(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        trust: DeviceTrustVerdict,
    ): Promise<{ added: number; unclaimed: DeviceId[] }>

    /**
     * The account's devices as this device judges them itself (`identity-provider/specs/e2ee.md
     * § 3.9`), from `devices` — `GET /api/keys/devices` read just before. A list naming a device id
     * twice is refused whole (`device-list-refused`), as is a review whose kept revocations can't be
     * read: nothing is decided or kept. Otherwise the revocations listed are kept for good, and,
     * unless a pending history key waits, the key is read again: only a device holding the current
     * passphrase, its own derivation of the approval key the stored one, acts — each device's root
     * key and approvals checked under the key it derived, those found approved and those seen kept,
     * every device still unapproved standing. Any device warns of a generation set by a device it
     * never found approved, or attributed to itself when it set none.
     */
    reviewDevices(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        devices: readonly DeviceListEntry[],
    ): Promise<DeviceTrustVerdict>

    /** `deviceBaseline` kept from `devices`, read just before; the kept verdict refreshed with what it left behind. */
    takeDeviceBaseline(generation: number, devices: readonly DeviceListEntry[], intent: BaselineIntent | null): Promise<void>

    /**
     * Commits out of a group this device holds, one a commit, each judged against the tree as it
     * stands just before (an index changes hands), every non-own leaf verified: a forgery
     * (`identity-provider/specs/e2ee.md § 3.4`), and — when `trust` acts under the generation still
     * held — a leaf of the account's own whose root key the list doesn't show approved for its
     * device. Before the first of those, `reviewAgain` reads the list again. A leaf whose attestation
     * only expired is warned of and stays; what couldn't be settled is left. A leaf committed out
     * drops its record. A commit refused other than by an epoch race throws, the records kept for
     * the next run; one refused for good isn't tried again in this page load.
     */
    removeUntrustedLeaves(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        trust: DeviceTrustVerdict | null,
        reviewAgain?: () => Promise<DeviceTrustVerdict | null>,
    ): Promise<{ removed: number }>

    /**
     * Puts in this device's own leaf the credential it would make now for the key the leaf
     * carries — a leaf from before the leaf binding, or before the attestation was renewed —, one
     * commit when it differs. An epoch race is handled as {@link IE2eePort.pruneGroup} does.
     */
    refreshOwnLeaf(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
    ): Promise<{ refreshed: boolean }>

    /**
     * Calls `listener` after each registration that brought a new attestation — a renewal, or a
     * device's first HPKE key —: its leaves then take the new credential (`refreshOwnLeaf`).
     * Answers the unsubscribe.
     */
    onDeviceRegistered(listener: () => void): () => void

    /**
     * Calls `listener` with each trust event as it comes to stand: a device unapproved (`arrived`
     * the first time this device sees it under that root key — what a notice is for), a generation
     * set by a device this one never found approved, a key under the generation held that isn't
     * the one its words give, a device list refused, and an untrusted leaf — one met failing the
     * checks of `identity-provider/specs/e2ee.md § 3.4`, or a leaf of the account's own not
     * approved. Those standing are replayed to a listener subscribing late. A leaf whose issuer
     * couldn't be reached is checked again when next met, never recorded. Answers the unsubscribe.
     */
    onTrustEvent(listener: (event: TrustEvent) => void): () => void

    /** Calls `listener` with each trust event as it stops standing: what it was about changed. Answers the unsubscribe. */
    onTrustWithdrawn(listener: (event: TrustEvent) => void): () => void

    /** What stands now: rebuilt by each review after a reload, an unapproved device included. */
    trustSnapshot(): TrustEvent[]

    /**
     * The last review's verdict, `null` before any this page load; it stops acting once this device
     * no longer holds the generation it acted under. The same object until it changes.
     */
    verdictSnapshot(): DeviceTrustVerdict | null

    /** Calls `listener` each time {@link IE2eePort.verdictSnapshot} changes. Answers the unsubscribe. */
    onVerdict(listener: () => void): () => void

    /** Drop a group's MLS state from this device, as a group the user was removed from is cleared. */
    forgetGroup(conversationId: ConversationId): Promise<void>

    /**
     * Tops this device's KeyPackage stash up to the server's cap when
     * `GET /api/keys/packages/status` reports it at the refill
     * threshold, or doesn't list it at all. Concurrent calls share one
     * run.
     */
    replenishKeyPackages(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<KeyPackageStatusResponse>

    // ─── Per-device IdP attestation + history backup ────────────────────

    /**
     * Idempotent — generates the Device Root Key and the device's HPKE key on first call, signs
     * the HPKE key with the root key and registers both, persists locally. Registers again within
     * 30 days of the attestation's expiry, and at once on a device holding no HPKE key yet — or
     * whenever `again`, the same keys sent once more: the IdP refused a proof by the root key it
     * should hold. A session that named another device refuses it: `IdpError` 403 `device_mismatch`.
     */
    registerDevice(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        options?: { again?: boolean },
    ): Promise<void>

    /**
     * This device's root key over `PINAI-SESSION-DEVICE-v1` for the session `sessionId`: the proof
     * that names it on that session (`identity-provider/specs/auth.md § 1`, "Sessions and devices").
     * Throws when the device has no root key yet.
     */
    signSessionDevice(actorUri: ActorUri, deviceId: DeviceId, sessionId: string): Promise<Uint8Array>

    /**
     * Queue an entry for the history archive: a message this device sent or read. An id is queued
     * once per page load; a no-op when the archive is unwired. Entries wait unsealed while the
     * history key is unchecked or held — at most `ARCHIVE_BUFFER_LIMIT`, the oldest dropped —,
     * and go out sealed under the generation held, their ids bound as associated data, only once
     * the device is approved under it (`savesToArchive`). Refused with `approval_required`, they
     * wait again until the next check of the key or {@link IE2eePort.approvalLanded}.
     */
    bufferForArchive(conversationId: ConversationId, entryId: string, entry: ArchiveEnvelope): void

    /** An edit, under the id its MLS ciphertext gives (`editEntryId`): archived once, wherever met. */
    bufferEditForArchive(conversationId: ConversationId, editCiphertext: Uint8Array, entry: ArchiveEnvelope): void

    /**
     * History-archive upload lifecycle — the auth layout starts/stops these. The access token is
     * read at each upload, so the loop outlives renewals.
     */
    startFlushing(idpUrl: string, accessToken: () => string | null): void
    stopFlushing(): void

    /** An approval landed on the account (`device_approved`): saves the instance refused for this device's approval may go again. */
    approvalLanded(): void

    /**
     * `listener` is told when saves held back for this device's approval may go: it comes to stand
     * approved under the key it holds (`opensSaves`), or, after an `approval_required`, the key is
     * checked again or an approval lands — or one did while the re-archive's batch was being
     * refused. Answers the unsubscribe.
     */
    onSavesResumable(listener: () => void): () => void

    // ─── The history key (`identity-provider/specs/e2ee.md § 3.6–3.9`) ─────

    /**
     * 24 new words for `generation` and the key they give, sealed as this device's pending key
     * before they are answered: never shown, reported or used to seal. A pending key of that
     * generation already sealed gives its words again, written anew, until
     * {@link IE2eePort.dropPendingHistoryKey}. `rearchive`: they replace words this device holds,
     * and whoever promotes them — this flow, or the next start's settle — marks the re-archive due.
     * `intent`: kept with them, for the settle's baseline.
     */
    mintHistoryKey(
        generation: number,
        options?: { rearchive?: boolean; intent?: BaselineIntent },
    ): Promise<{ words: string[]; key: HistoryKey }>

    /** The pending key, its words left out, with when it was written; `null` when none waits. */
    pendingHistoryKey(): Promise<PendingHistoryKey | null>

    /**
     * The IdP took the pending key: its words become the ones this device keeps. `show`: they are
     * new words a start over set, kept to show ({@link IE2eePort.newWordsToShow}) until
     * dismissed. `rearchive`, or a pending key minted so: the archive is re-made from this device's
     * copy under its generation ({@link IE2eePort.historyRearchiveDue}), marked before the words
     * are kept. A no-op without one.
     */
    promotePendingHistoryKey(options?: { show?: boolean; rearchive?: boolean }): Promise<void>

    /** The pending key erased, with its words and their derivation, and the new words to show of its generation. */
    dropPendingHistoryKey(): Promise<void>

    /** The words a start over set and the user hasn't gone past yet, while they are the ones kept and nothing is pending. */
    newWordsToShow(): Promise<{ generation: number; words: string[] } | null>

    /** The new words need no showing any more: seen, or no longer the key in force. */
    dismissNewWords(): Promise<void>

    /** What `words` give under `salt`: Argon2id once per words and salt, then the check value and approval key. */
    deriveHistoryKey(words: string[], salt: Uint8Array): Promise<DerivedHistoryKey>

    /**
     * Keeps `words` as this device's passphrase for `key`'s generation. Words that don't give
     * `key`, a generation older than one seen, or words another tab replaced meanwhile throw.
     */
    keepPassphrase(words: string[], key: HistoryKey): Promise<void>

    /** The newest generation of the history key this device has seen, `null` before any. */
    newestHistoryGeneration(): Promise<number | null>

    /**
     * Reads the key in force and stands the words this device keeps against it (`standingAgainst`).
     * The standing is recorded; out of `holds`, nothing is uploaded and the words stay.
     */
    checkHistoryKey(idpUrl: string, accessToken: string): Promise<HistoryKeyStanding>

    /** The standing this page load found, else the one last recorded. */
    historyKeyStanding(): Promise<HistoryKeyStanding>

    /** Kept beside the standing, for a page load that can't reach the IdP: a failure to keep it is logged. */
    recordAdmission(admission: Admission): Promise<void>

    /** The admission last recorded; `null` before any. */
    recordedAdmission(): Promise<Admission | null>

    /**
     * This device approved by the passphrase it holds: the generation's approval key over
     * `PINAI-DEVICE-APPROVAL-v1` for its own root key. Checked first when unchecked; throws when
     * it holds none.
     */
    signPassphraseApproval(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
    ): Promise<{ deviceId: DeviceId; generation: number; signature: Uint8Array; rootKey: Uint8Array }>

    /** Approved by the passphrase over `rootKey` and reported under `generation`. */
    recordPassphraseApproval(generation: number, rootKey: Uint8Array): Promise<void>

    /**
     * The archive opened under the key this device holds, each entry with the ids its row
     * carries as associated data; `skipped` counts those that don't open — damaged, or moved.
     */
    restoreHistory(idpUrl: string, accessToken: string): Promise<{ entries: ArchivedEntry[]; skipped: number }>

    /** The words this device keeps, for Settings → Devices. */
    loadStoredPassphrase(): Promise<string[] | null>

    // ─── The code handshake (`identity-provider/specs/e2ee.md § 3.10`) ─────

    /** Six digits drawn uniformly at random, for one request: shown, never sent anywhere. */
    newApprovalCode(): string

    /**
     * One side of one exchange on `requestId` keyed by `code`, carrying this device's root key and
     * HPKE key. The answerer names the asking device; the asker learns its peer from the answer.
     * Throws when this device has no root key or HPKE key yet.
     */
    startApprovalHandshake(input: {
        role: HandshakeRole
        code: string
        requestId: string
        actorUri: ActorUri
        peerDeviceId: DeviceId | null
    }): Promise<ApprovalHandshakeSession>

    /**
     * The peer's keys as the exchange gave them, against `devices` — `GET /api/keys/devices` read
     * just before: unrevoked (nor seen revoked), both keys the listed ones, its chain JWKS →
     * attestation → root key verifying. A refusal stands as a trust event, its latest reason, and
     * is withdrawn once the device passes; what can't be settled — a list naming an id twice, an
     * issuer out of reach, an expired attestation, revocations kept that can't be read — is
     * `unsettled`, never a refusal.
     */
    checkHandshakePeer(
        actorUri: ActorUri,
        peer: HandshakePartner,
        devices: readonly DeviceListEntry[],
    ): Promise<{ ok: true } | { ok: false; reason: HandshakeKeysRefusal | "unsettled" }>

    /** This device's root key over `PINAI-DEVICE-APPROVAL-v1` for `deviceId` and `rootKey`. */
    signDeviceApproval(actorUri: ActorUri, deviceId: DeviceId, rootKey: Uint8Array): Promise<Uint8Array>

    /** Whether `signature` is `approverRootKey` approving this very device over its own root key. */
    approvesThisDevice(actorUri: ActorUri, approverRootKey: Uint8Array, signature: Uint8Array): Promise<boolean>

    /** Kept in `device_trust` for good, with the keys from the exchange. */
    rememberHandshakePartner(partner: HandshakePartner): Promise<void>

    /** The devices this one approved, and was approved by, in a code handshake. */
    handshakePartners(): Promise<HandshakePartner[]>

    /**
     * What `deviceAdmission` judges a device without the passphrase on, from `devices` — `GET
     * /api/keys/devices` read just before: each handshake partner with whether one of its `by:
     * device` approvals listed for this device verifies over this device's current root key under
     * the partner's root key from the exchange, and the revocations seen — the list's kept for good
     * first, unless it names an id twice. `null` when the kept revocations can't be read.
     */
    checkHandshakePartners(
        actorUri: ActorUri,
        devices: readonly DeviceListEntry[],
    ): Promise<{ partners: CheckedPartner[]; revokedSeen: DeviceId[] } | null>

    // ─── Key shares (`identity-provider/specs/e2ee.md § 3.11`) ─────

    /**
     * The words this device holds, sealed for each partner `shareCandidates` picks from `devices`
     * — `GET /api/keys/devices` read just before —, its approval by this device verifying, its chain
     * verifying from the root key the exchange gave, sealed for the HPKE key the list shows. None
     * unless the device holds the current generation, settled. A partner the list shows other keys
     * for stands as `share-recipient-refused`; one whose chain can't be settled is left for the next
     * refresh.
     */
    sealHistoryShares(actorUri: ActorUri, devices: readonly DeviceListEntry[]): Promise<OutgoingKeyShare[]>

    /** The instance refused a share for good: `recipient` isn't sealed for under `generation` again this page load. */
    forgoHistoryShare(recipient: DeviceId, generation: number): void

    /**
     * The four checks of § 3.11 on the share waiting for this device, in order, `key` the one in
     * force: from a handshake partner (never one seen revoked), signed by the root key the exchange
     * gave, opening under this device's HPKE key, its words giving `key`. A failure stands as
     * `share-refused`; `unsettled` — the revocations kept can't be read — decides nothing.
     */
    openHistoryShare(
        actorUri: ActorUri,
        share: KeyShare,
        key: HistoryKey,
    ): Promise<{ ok: true; words: string[] } | { ok: false; reason: KeyShareRefusal | "unsettled" }>

    /** The archive is to be restored under `generation`: kept through reloads until a restore is confirmed. */
    markHistoryRestoreDue(generation: number): Promise<void>

    /** The restore due, and when it was last applied (`null` before); `null` when none is. */
    historyRestoreDue(): Promise<{ generation: number; appliedAt: string | null } | null>

    /** Applied under `generation`: the next page load whose cache was read back confirms it. A no-op when another is due. */
    historyRestoreApplied(generation: number): Promise<void>

    /** The restore due under `generation` is confirmed, or moot. A no-op when another is due. */
    historyRestored(generation: number): Promise<void>

    // ─── The re-archive after a replacement of the words ─────

    /** The re-archive due, with how far it got; `null` when none is. Kept through reloads. */
    historyRearchiveDue(): Promise<RearchiveDue | null>

    /** The IdP took every entry up to `cursor`. A no-op when another is due. */
    advanceHistoryRearchive(generation: number, cursor: RearchivePosition): Promise<void>

    /** Done, or moot. A no-op when another is due. */
    historyRearchived(generation: number): Promise<void>

    /**
     * `entries` sealed under `generation` — `null` unless this device holds it —, each under its ids
     * as associated data, a reaction snapshot under the id the history key gives it. The archive
     * flusher's copies of them, waiting, are dropped, and it queues none of them again this page load.
     */
    sealForRearchive(generation: number, entries: readonly RearchiveEntry[]): Promise<SealedRearchive | null>

    /**
     * One sealed batch to the archive; sending it again is harmless. Refused as
     * `IHistoryArchivePort.uploadBatch` is; an `approval_required` holds this device's saves back
     * as the flusher's are ({@link IE2eePort.onSavesResumable}).
     */
    uploadRearchive(idpUrl: string, accessToken: string, sealed: SealedRearchive): Promise<void>

    /**
     * The device that set the generation in force past the one this device holds, as the last check
     * of the key found it, and whether this device found it approved over the root key `devices` —
     * `GET /api/keys/devices` read just before — lists for it now (`resetByUnapproved`); `self` when
     * it names this very device, which set no such generation. `null` when no such generation stands,
     * or names no device, or — another device named — the list names an id twice, or the revocations
     * kept can't be read.
     */
    resetSetter(devices: readonly DeviceListEntry[]): Promise<ResetSetter | null>

    /**
     * The devices of `devices` the instance counts approved under its key in force: the approval
     * rule (`approvedDevicesBy`) over the approvals as verified under the approval key it stores —
     * its word, never this device's derivation —, the revocations kept counted. It decides no trust:
     * only what the instance refuses a device it doesn't count approved — revoking one of these,
     * clearing the history backup, signing the other devices out. `null` without a key in force:
     * the instance then refuses none of these for approval.
     */
    approvedAsTheInstanceCounts(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        devices: readonly DeviceListEntry[],
    ): Promise<DeviceId[] | null>
}

/** A re-archive's batch, sealed: what `uploadRearchive` sends, as many times as it takes. */
export interface SealedRearchive {
    generation: number
    entries: ArchiveEntry[]
}

/**
 * One side of a code handshake: SPAKE2 keyed by the code, then each side's keys sealed under the
 * session key. The messages are opaque bytes for the relay.
 */
export interface ApprovalHandshakeSession {
    /** The asker's first message, its SPAKE2 share; `null` for the answerer, which speaks second. */
    opening(): Uint8Array | null
    /**
     * The peer's next message, in order: what to send back, and the peer's keys once they came. A
     * confirmation that doesn't verify throws `HandshakeRefused("wrong-code")`; a message out of
     * turn or format, or a seal that doesn't open, `HandshakeRefused("tampered")`.
     */
    receive(body: Uint8Array, from: DeviceId): { reply: Uint8Array | null; peerKeys: ExchangedKeys | null }
    /** Its secrets dropped; it takes nothing more. Done by itself once the peer's keys came, or on a refusal. */
    close(): void
}

export const E2EE_PORT = "E2EE_PORT"
