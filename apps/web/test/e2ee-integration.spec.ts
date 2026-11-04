/**
 * Phase 5d.2 — full-loop integration test.
 *
 * Drives two `E2eeAdapter` instances (Alice + Bob) end-to-end against
 * an in-memory key directory and an in-memory storage backend. No
 * mocking of the MLS layer: this is the same WASM bundle the browser
 * runs.
 *
 * The directory attests root keys as the IdP would, under each instance's own key, and the
 * devices check every leaf against those keys (`setup/issuers.ts`).
 *
 * Flow under test:
 *   1. Alice + Bob register (root key attested, then a 50-KP stash each).
 *   2. Alice adds Bob to a fresh conversation (claim + commit + welcome).
 *   3. Bob consumes the pending welcome (joins the group).
 *   4. Alice sends a text → Bob decrypts.
 *   5. Bob sends a reaction → Alice decrypts.
 *   6. Alice edits the text → Bob decrypts.
 *   7. Alice attaches an encrypted file → Bob fetches + decrypts the
 *      ciphertext using the per-attachment key carried in the MLS body.
 */

import { beforeAll, describe, expect, it, vi } from "vitest"

import { loadWasmModule } from "./setup/wasm"
import { generateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"

import { FakeHistoryIdp, FastSealer } from "./setup/history-idp"
import {
    FakeIssuers,
    approvedBy,
    approvedByPassphrase,
    credentialFor,
    listedDevice,
    testDevice,
    wholeSeconds,
    type TestDevice,
} from "./setup/issuers"

import { verifyLeafCredential, verifyStrict } from "@pinai/crypto/attestation-chain.adapter"
import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import { KeyPackageUnavailable } from "@pinai/domain/models/group"
import { deviceHpkeKeyBytes } from "@pinai/crypto/canonical-bytes"
import type { LeafCredential, UntrustedLeaf } from "@pinai/domain/models/leaf-trust"

import { decryptDownloaded, encryptForUpload } from "@pinai/crypto/attachment-crypto"
import { E2eeAdapter } from "@pinai/crypto/e2ee.adapter"
import { NobleIdentityAdapter } from "@pinai/crypto/identity.adapter"
import type {
    CommitView,
    IdentityKeysResponse,
    IKeyDirectoryPort,
    RegisterDeviceResponse,
    WelcomeView,
} from "@pinai/domain/ports/key-directory.port"
import { MlsAdapter } from "@pinai/mls/wasm.adapter"
import type {
    DeviceAttestation,
    E2eeStorage,
    KeptPassphrase,
    MlsSnapshot,
    PendingPassphrase,
    RestoreDue,
} from "@pinai/crypto/sealed-storage"
import type { HistoryKeyStanding } from "@pinai/domain/models/history-key"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import type { Admission } from "@pinai/domain/models/admission"
import { oneAtATime } from "@pinai/domain/lib/one-at-a-time"
import { syncOwnGroupsUseCase } from "@pinai/domain/usecases/e2ee/sync-own-groups.usecase"
import {
    emptyDeviceTrust,
    withTrust,
    type DeviceTrust,
    type DeviceTrustVerdict,
    type KnownDevice,
} from "@pinai/domain/models/device-trust"
import type { LocalFile } from "@pinai/domain/models/file"
import type { IJwksCachePort } from "@pinai/domain/ports/jwks-cache.port"
import { IdpError } from "@pinai/domain/models/idp-error"
import { asActorUri } from "@pinai/domain/models/identity"
import type {
    ActorUri,
    ApplicationMessage,
    ClaimedKeyPackage,
    ConversationId,
    DeviceId,
    EditBody,
    IdentityKeypair,
    IdentityPublicKeys,
    KeyPackageStatusResponse,
    ReactionBody,
    TextBody,
} from "@pinai/domain/models/e2ee"

let wasmModule: WebAssembly.Module

beforeAll(async () => {
    wasmModule = await loadWasmModule()
})

// ─── In-memory key directory (single backend, two identities) ────────

interface PackageEntry {
    deviceId: DeviceId
    bytes: Uint8Array
    expiresAt: string
}

/** Every instance's attestation key, which the directory signs with and the devices check against. */
const issuers = new FakeIssuers()

class InMemoryKeyDirectory implements IKeyDirectoryPort {
    /** As the IdP does: the HPKE key's signature checked under the root key sent with it, then the root key attested. */
    async registerDevice(
        _idpUrl: string,
        accessToken: string,
        deviceId: DeviceId,
        drkPublicKey: Uint8Array,
        hpkeKey: { publicKey: Uint8Array; signature: Uint8Array },
    ): Promise<RegisterDeviceResponse> {
        const actorUri = this.resolveSender(accessToken)
        if (!verifyStrict(hpkeKey.signature, deviceHpkeKeyBytes(actorUri, deviceId, hpkeKey.publicKey), drkPublicKey)) {
            throw new IdpError(400, "invalid_request", "hpke_key_signature does not verify against drk_public_key")
        }
        const answer = issuers.attest(actorUri, deviceId, drkPublicKey, this.attestUntil ?? undefined)
        await this.beforeRegistrationAnswers?.()
        return answer
    }

    /** The expiry the next attestations carry; a year on when unset. */
    attestUntil: string | null = null
    /** Runs before a registration is answered: the window it is under way in. */
    beforeRegistrationAnswers: (() => Promise<void>) | null = null

    /** Puts `packages` in place of what `actorUri`'s device holds, as an instance serving its own would. */
    stash(actorUri: ActorUri, deviceId: DeviceId, packages: Uint8Array[]): void {
        const others = (this.packagesByActor.get(actorUri) ?? []).filter((p) => p.deviceId !== deviceId)
        const expiresAt = new Date(Date.now() + 86_400_000).toISOString()
        this.packagesByActor.set(actorUri, [...packages.map((bytes) => ({ deviceId, bytes, expiresAt })), ...others])
    }

    private readonly identityByActor = new Map<ActorUri, IdentityKeysResponse>()
    private readonly packagesByActor = new Map<ActorUri, PackageEntry[]>()
    private readonly commitsByConversation = new Map<ConversationId, CommitView[]>()
    private readonly welcomesByDevice = new Map<DeviceId, WelcomeView[]>()
    private readonly senderByToken = new Map<string, ActorUri>()
    /** attachment-id → ciphertext bytes (the IdP's RustFS, stubbed). */
    readonly blobs = new Map<string, Uint8Array>()

    bindToken(accessToken: string, actorUri: ActorUri): void {
        this.senderByToken.set(accessToken, actorUri)
    }

    private resolveSender(accessToken: string): ActorUri {
        const a = this.senderByToken.get(accessToken)
        if (!a) throw new Error(`No actor bound for token ${accessToken}`)
        return a
    }

    async publishIdentity(
        _idpUrl: string,
        accessToken: string,
        keys: IdentityPublicKeys,
    ): Promise<void> {
        const actorUri = this.resolveSender(accessToken)
        const now = new Date().toISOString()
        this.identityByActor.set(actorUri, { keys, published_at: now, rotated_at: now })
    }

    async getIdentity(
        _idpUrl: string,
        _accessToken: string,
        actorUri: ActorUri,
    ): Promise<IdentityKeysResponse | null> {
        return this.identityByActor.get(actorUri) ?? null
    }

    async uploadKeyPackages(
        _idpUrl: string,
        accessToken: string,
        deviceId: DeviceId,
        packages: { key_package: Uint8Array; expires_at: string }[],
    ): Promise<{ uploaded: number; available_after: number }> {
        const actorUri = this.resolveSender(accessToken)
        const stash = this.packagesByActor.get(actorUri) ?? []
        for (const p of packages) {
            stash.push({ deviceId, bytes: p.key_package, expiresAt: p.expires_at })
        }
        this.packagesByActor.set(actorUri, stash)
        return { uploaded: packages.length, available_after: stash.length }
    }

    async claimKeyPackage(
        _idpUrl: string,
        _accessToken: string,
        actorUri: ActorUri,
        deviceId: DeviceId | null,
    ): Promise<ClaimedKeyPackage> {
        const stash = this.packagesByActor.get(actorUri) ?? []
        const idx = stash.findIndex((p) => deviceId == null || p.deviceId === deviceId)
        if (idx < 0) throw new Error(`No KeyPackage available for ${actorUri}`)
        const claimed = stash.splice(idx, 1)[0]
        const remaining = stash.filter((p) => p.deviceId === claimed.deviceId).length
        return {
            key_package: claimed.bytes,
            device_id: claimed.deviceId,
            expires_at: claimed.expiresAt,
            remaining_count: remaining,
            needs_refill: remaining <= 10,
        }
    }

    async claimEachDevice(
        _idpUrl: string,
        _accessToken: string,
        actorUri: ActorUri,
    ): Promise<ClaimedKeyPackage[]> {
        const stash = this.packagesByActor.get(actorUri) ?? []
        const devices = [...new Set(stash.map((p) => p.deviceId))]
        const claimed: ClaimedKeyPackage[] = []
        for (const device of devices) claimed.push(await this.claimKeyPackage(_idpUrl, _accessToken, actorUri, device))
        if (claimed.length === 0) throw new Error(`No KeyPackage available for ${actorUri}`)
        return claimed
    }

    /** What a reset database, or every package claimed or swept, leaves of an account's stash. */
    forgetPackages(actorUri: ActorUri): void {
        this.packagesByActor.delete(actorUri)
    }

    packagesOf(actorUri: ActorUri): number {
        return this.packagesByActor.get(actorUri)?.length ?? 0
    }

    async getKeyPackageStatus(
        _idpUrl: string,
        accessToken: string,
    ): Promise<KeyPackageStatusResponse> {
        const actorUri = this.resolveSender(accessToken)
        const stash = this.packagesByActor.get(actorUri) ?? []
        const byDevice = new Map<DeviceId, number>()
        for (const p of stash) byDevice.set(p.deviceId, (byDevice.get(p.deviceId) ?? 0) + 1)
        return {
            devices: [...byDevice.entries()].map(([device_id, available]) => ({
                device_id,
                available,
                needs_refill: available <= 10,
            })),
            refill_threshold: 10,
            cap: 100,
        }
    }

    /** The next commit posted is lost on its way, as a dropped connection would lose it. */
    failNextCommit = false
    /** Runs once a commit is stored, before its sender hears back: the window the DS pushes it in. */
    afterCommitStored: (() => Promise<void>) | null = null

    async postCommit(
        _idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        epoch: number,
        commitBlob: Uint8Array,
    ): Promise<CommitView> {
        if (this.failNextCommit) {
            this.failNextCommit = false
            throw new Error("connection reset")
        }
        // The DS's unique (conversation, epoch): the first commit at an epoch wins.
        if ((this.commitsByConversation.get(conversationId) ?? []).some((c) => c.epoch === epoch)) {
            throw new IdpError(409, "conflict", "That epoch is taken")
        }
        const actorUri = this.resolveSender(accessToken)
        const view: CommitView = {
            id: crypto.randomUUID(),
            conversation_id: conversationId,
            epoch,
            proposer_actor_uri: actorUri,
            commit_blob: commitBlob,
            created_at: new Date().toISOString(),
        }
        const log = this.commitsByConversation.get(conversationId) ?? []
        log.push(view)
        this.commitsByConversation.set(conversationId, log)
        await this.afterCommitStored?.()
        return view
    }

    async getCommitsSince(
        _idpUrl: string,
        _accessToken: string,
        conversationId: ConversationId,
        sinceEpoch: number,
    ): Promise<{ commits: CommitView[]; has_more: boolean }> {
        const log = this.commitsByConversation.get(conversationId) ?? []
        return { commits: log.filter((c) => c.epoch > sinceEpoch), has_more: false }
    }

    async getWelcomes(
        _idpUrl: string,
        _accessToken: string,
        deviceId: DeviceId,
    ): Promise<WelcomeView[]> {
        const queue = this.welcomesByDevice.get(deviceId) ?? []
        this.welcomesByDevice.set(deviceId, [])
        return queue
    }

    /** IdP issuer the (stub) sender's IdP belongs to. */
    senderIssuer = "https://idp.alice.example"
    /** Tracks the routing decision the sender's IdP would have made. */
    readonly welcomeRouting: Array<{
        recipient_actor_uri: ActorUri
        recipient_device_id: DeviceId
        conversation_id: ConversationId
        path: "local" | "remote"
    }> = []

    async postWelcome(
        _idpUrl: string,
        _accessToken: string,
        body: {
            recipient_actor_uri: ActorUri
            recipient_device_id: DeviceId
            conversation_id: ConversationId
            welcome_blob: Uint8Array
        },
    ): Promise<{ id: string }> {
        // Mirror the server's local-vs-remote split. Local: queue the
        // welcome on the recipient device. Remote: simulate the AP
        // delivery by handing it to the same in-memory queue (the
        // recipient client polls the same shared backend in this
        // test) but tag the decision.
        const isLocal = body.recipient_actor_uri.startsWith(`${this.senderIssuer}/users/`)
        const id = isLocal ? crypto.randomUUID() : "00000000-0000-0000-0000-000000000000"
        const view: WelcomeView = {
            id,
            conversation_id: body.conversation_id,
            recipient_device_id: body.recipient_device_id,
            welcome_blob: body.welcome_blob,
            created_at: new Date().toISOString(),
        }
        const queue = this.welcomesByDevice.get(body.recipient_device_id) ?? []
        queue.push(view)
        this.welcomesByDevice.set(body.recipient_device_id, queue)
        this.welcomeRouting.push({
            recipient_actor_uri: body.recipient_actor_uri,
            recipient_device_id: body.recipient_device_id,
            conversation_id: body.conversation_id,
            path: isLocal ? "local" : "remote",
        })
        return { id }
    }
}

// ─── In-memory storage (one per adapter — distinct device ids) ───────

class InMemoryE2eeStorage implements E2eeStorage {
    private deviceId: DeviceId | null = null
    private keypair: IdentityKeypair | null = null
    private snapshot: MlsSnapshot | null = null
    private kept: KeptPassphrase | null = null
    private pending: PendingPassphrase | null = null
    private standing: HistoryKeyStanding | null = null
    private admission: Admission | null = null
    private newest: number | null = null
    private boundActorUri: ActorUri | null = null
    private deviceAttestation: DeviceAttestation | null = null
    private trust: DeviceTrust = emptyDeviceTrust()

    async getOrCreateDeviceId(): Promise<DeviceId> {
        if (!this.deviceId) this.deviceId = crypto.randomUUID()
        return this.deviceId
    }
    /** What a race on the first device id left: the id stored isn't the one its leaves carry. */
    replaceDeviceId(id: DeviceId): void {
        this.deviceId = id
    }
    async saveIdentityKeypair(k: IdentityKeypair): Promise<void> {
        this.keypair = k
    }
    async loadIdentityKeypair(): Promise<IdentityKeypair | null> {
        return this.keypair
    }
    async saveMlsSnapshot(s: MlsSnapshot): Promise<void> {
        this.snapshot = s
    }
    async loadMlsSnapshot(): Promise<MlsSnapshot | null> {
        return this.snapshot
    }
    async saveKeptPassphrase(kept: KeptPassphrase): Promise<void> {
        this.kept = structuredClone(kept)
    }
    async loadKeptPassphrase(): Promise<KeptPassphrase | null> {
        return structuredClone(this.kept)
    }
    async savePendingPassphrase(pending: PendingPassphrase): Promise<void> {
        this.pending = structuredClone(pending)
    }
    async loadPendingPassphrase(): Promise<PendingPassphrase | null> {
        return structuredClone(this.pending)
    }
    async clearPendingPassphrase(): Promise<void> {
        this.pending = null
    }
    async saveNewestHistoryGeneration(generation: number): Promise<void> {
        this.newest = generation
    }
    async loadNewestHistoryGeneration(): Promise<number | null> {
        return this.newest
    }
    private restoreDue: RestoreDue | null = null
    async saveRestoreDue(due: RestoreDue): Promise<void> {
        this.restoreDue = { ...due }
    }
    async loadRestoreDue(): Promise<RestoreDue | null> {
        return this.restoreDue && { ...this.restoreDue }
    }
    async clearRestoreDue(): Promise<void> {
        this.restoreDue = null
    }
    async saveHistoryKeyStanding(standing: HistoryKeyStanding): Promise<void> {
        this.standing = standing
    }
    async loadHistoryKeyStanding(): Promise<HistoryKeyStanding | null> {
        return this.standing
    }
    async saveAdmission(admission: Admission): Promise<void> {
        this.admission = admission
    }
    async loadAdmission(): Promise<Admission | null> {
        return this.admission
    }
    async saveDeviceAttestation(attestation: DeviceAttestation): Promise<void> {
        this.deviceAttestation = attestation
    }
    async loadDeviceAttestation(): Promise<DeviceAttestation | null> {
        return this.deviceAttestation
    }
    async loadDeviceTrust(): Promise<{ trust: DeviceTrust; unreadable: [] }> {
        return { trust: structuredClone(this.trust), unreadable: [] }
    }
    async addToDeviceTrust(change: Partial<DeviceTrust>): Promise<DeviceTrust> {
        this.trust = structuredClone(withTrust(this.trust, change))
        return structuredClone(this.trust)
    }
    async getBoundActorUri(): Promise<ActorUri | null> {
        return this.boundActorUri
    }
    async setBoundActorUri(actorUri: ActorUri): Promise<void> {
        this.boundActorUri = actorUri
    }
    async clear(): Promise<void> {
        this.deviceId = null
        this.keypair = null
        this.snapshot = null
        this.kept = null
        this.pending = null
        this.standing = null
        this.newest = null
        this.restoreDue = null
        this.boundActorUri = null
        this.trust = emptyDeviceTrust()
    }
}

interface AdapterCtx {
    e2ee: E2eeAdapter
    mls: MlsAdapter
    storage: InMemoryE2eeStorage
    history?: FakeHistoryIdp | null
}

/** `history`, when given, is the account's history key: the device can then hold its words and act on approval. */
async function buildAdapter(
    directory: InMemoryKeyDirectory,
    accessToken: string,
    actorUri: ActorUri,
    history: FakeHistoryIdp | null = null,
    jwks: IJwksCachePort = issuers.jwks,
): Promise<AdapterCtx> {
    const mls = new MlsAdapter()
    await mls.initialize({ module_or_path: wasmModule } as never)
    const storage = new InMemoryE2eeStorage()
    const identity = new NobleIdentityAdapter()
    const sealer = history ? new FastSealer() : null
    const e2ee = new E2eeAdapter(identity, mls, storage, directory, mls, jwks, history, sealer)
    directory.bindToken(accessToken, actorUri)
    return { e2ee, mls, storage, history }
}

/** The account's history key, generation 1: a device given its words (`hold`) acts on approval. */
async function accountKey(history: FakeHistoryIdp) {
    const sealer = new FastSealer()
    const words = generateMnemonic(wordlist, 256).split(" ")
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const hak = await sealer.deriveKey(words, salt)
    const key = { generation: 1, salt, ...sealer.derive(hak) }
    history.key = { ...key, setByDevice: null }
    return { hak, hold: (ctx: AdapterCtx) => ctx.e2ee.keepPassphrase(words, key) }
}

/** The device as its root key makes it. */
async function known(ctx: AdapterCtx): Promise<KnownDevice> {
    return { deviceId: await ctx.storage.getOrCreateDeviceId(), rootKey: (await ctx.storage.loadDeviceAttestation())!.drk_public }
}

/** What a review by `self`, holding generation 1's words, finds when it approves `siblings` over the root keys they hold. */
async function trusting(self: AdapterCtx, ...siblings: AdapterCtx[]): Promise<DeviceTrustVerdict> {
    const devices = await Promise.all([self, ...siblings].map(known))
    return { acting: true, generation: 1, thisDevice: devices[0].deviceId, listed: devices, approved: devices, unsettled: [] }
}

/** The untrusted leaves `ctx` tells of from now on, the records it holds first. */
function untrustedLeavesOf(ctx: AdapterCtx): UntrustedLeaf[] {
    const leaves: UntrustedLeaf[] = []
    ctx.e2ee.onTrustEvent((event) => {
        if (event.kind === "untrusted-leaf") leaves.push(event.leaf)
    })
    return leaves
}

/** The same device after a page reload: a fresh engine over what it persisted. */
async function reload(directory: InMemoryKeyDirectory, ctx: AdapterCtx): Promise<AdapterCtx> {
    const mls = new MlsAdapter()
    await mls.initialize({ module_or_path: wasmModule } as never)
    const history = ctx.history ?? null
    const e2ee = new E2eeAdapter(
        new NobleIdentityAdapter(),
        mls,
        ctx.storage,
        directory,
        mls,
        issuers.jwks,
        history,
        history ? new FastSealer() : null,
    )
    return { e2ee, mls, storage: ctx.storage, history }
}

describe("MLS E2EE — full-loop integration (Alice + Bob)", () => {
    const conversationId: ConversationId = "11112222-3333-4444-5555-666677778888"
    const aliceActor: ActorUri = asActorUri("https://idp.alice.example/users/alice_xK9mP")
    const bobActor: ActorUri = asActorUri("https://idp.bob.example/users/bob_aB1cDe")
    const idpUrl = "https://idp.shared.example"

    it("register → add → text → reaction → edit → attachment (cross-IdP welcome)", async () => {
        const directory = new InMemoryKeyDirectory()
        // Alice's IdP is the welcome's first hop; Bob lives on a
        // different issuer so the welcome should route as "remote".
        directory.senderIssuer = "https://idp.alice.example"
        const alice = await buildAdapter(directory, "alice-token", aliceActor)
        const bob = await buildAdapter(directory, "bob-token", bobActor)

        // 1. Register both users.
        const aliceReg = await alice.e2ee.register(idpUrl, "alice-token", aliceActor)
        const bobReg = await bob.e2ee.register(idpUrl, "bob-token", bobActor)
        expect(aliceReg.fingerprint).toMatch(/^[A-Z2-7]{60}$/)
        expect(bobReg.fingerprint).toMatch(/^[A-Z2-7]{60}$/)
        expect(aliceReg.device_id).not.toBe(bobReg.device_id)

        // 2. Alice adds Bob to a fresh conversation. Bob lives on a
        //    different IdP, so the welcome should be tagged as a
        //    cross-IdP delivery rather than a local insert.
        await alice.e2ee.addContactToGroup(idpUrl, "alice-token", conversationId, bobActor)
        expect(await alice.mls.hasGroup(conversationId)).toBe(true)
        expect(directory.welcomeRouting).toHaveLength(1)
        expect(directory.welcomeRouting[0]).toMatchObject({
            recipient_actor_uri: bobActor,
            conversation_id: conversationId,
            path: "remote",
        })

        // 3. Bob consumes the pending welcome.
        const consumed = await bob.e2ee.consumePendingWelcomes(idpUrl, "bob-token", bobActor)
        expect(consumed.joined).toBe(1)
        expect(await bob.mls.hasGroup(conversationId)).toBe(true)
        expect(await bob.mls.getEpoch(conversationId)).toBe(await alice.mls.getEpoch(conversationId))

        // 4. Alice sends "hello" → Bob decrypts.
        const aliceMessageId = "alice-msg-1"
        const helloMsg: ApplicationMessage<TextBody> = {
            version: 1,
            kind: "text",
            body: { text: "hello bob" },
        }
        const helloCt = await alice.e2ee.encryptOutbound(conversationId, helloMsg)
        const helloDecoded = await bob.e2ee.decryptInbound(conversationId, helloCt)
        expect(helloDecoded?.kind).toBe("text")
        expect((helloDecoded?.body as TextBody).text).toBe("hello bob")

        // 5. Bob reacts with 👍 → Alice decrypts.
        const reactMsg: ApplicationMessage<ReactionBody> = {
            version: 1,
            kind: "reaction",
            body: { target_message_id: aliceMessageId, emoji: "👍", op: "add" },
        }
        const reactCt = await bob.e2ee.encryptOutbound(conversationId, reactMsg)
        const reactDecoded = await alice.e2ee.decryptInbound(conversationId, reactCt)
        expect(reactDecoded?.kind).toBe("reaction")
        const recvReact = reactDecoded?.body as ReactionBody
        expect(recvReact.emoji).toBe("👍")
        expect(recvReact.target_message_id).toBe(aliceMessageId)
        expect(recvReact.op).toBe("add")

        // 6. Alice edits "hello" → "hi" → Bob decrypts.
        const editMsg: ApplicationMessage<EditBody> = {
            version: 1,
            kind: "edit",
            body: { target_message_id: aliceMessageId, new_text: "hi bob" },
        }
        const editCt = await alice.e2ee.encryptOutbound(conversationId, editMsg)
        const editDecoded = await bob.e2ee.decryptInbound(conversationId, editCt)
        expect(editDecoded?.kind).toBe("edit")
        expect((editDecoded?.body as EditBody).new_text).toBe("hi bob")

        // 7. Alice attaches a file. Encrypt-then-upload pipeline:
        //    fresh AES-256-GCM key + nonce + uuid → ciphertext goes to
        //    the (stubbed) blob store; the per-attachment key travels
        //    inside the MLS body.
        const fileBytes = new TextEncoder().encode("hello world from a file")
        const file: LocalFile = { name: "hello.txt", mimeType: "text/plain", bytes: fileBytes }
        const { ciphertext, key: blobKey } = await encryptForUpload(file)
        directory.blobs.set(blobKey.id, ciphertext)

        const attachMsg: ApplicationMessage<TextBody> = {
            version: 1,
            kind: "text",
            body: { text: "look at this", attachments: [blobKey] },
        }
        const attachCt = await alice.e2ee.encryptOutbound(conversationId, attachMsg)
        const attachDecoded = await bob.e2ee.decryptInbound(conversationId, attachCt)
        expect(attachDecoded?.kind).toBe("text")
        const recvBody = attachDecoded?.body as TextBody
        expect(recvBody.text).toBe("look at this")
        expect(recvBody.attachments).toBeDefined()
        expect(recvBody.attachments).toHaveLength(1)
        const recvKey = recvBody.attachments![0]
        expect(recvKey.id).toBe(blobKey.id)
        expect(recvKey.original_filename).toBe("hello.txt")
        expect(recvKey.mime_type).toBe("text/plain")
        expect(recvKey.byte_size).toBe(fileBytes.byteLength)
        // Per-attachment crypto material survives the JSON round trip
        // through the MLS body so the receiver can decrypt the blob.
        expect(recvKey.key).toBeInstanceOf(Uint8Array)
        expect(recvKey.key.length).toBe(32)
        expect(recvKey.nonce).toBeInstanceOf(Uint8Array)
        expect(recvKey.nonce.length).toBe(12)

        // Receiver fetches the ciphertext + decrypts.
        const fetched = directory.blobs.get(recvKey.id)
        expect(fetched).toBeDefined()
        const decryptedBytes = await decryptDownloaded(fetched!, recvKey)
        expect(new TextDecoder().decode(decryptedBytes)).toBe("hello world from a file")
    })

    it("routes a same-IdP welcome through the local insert path", async () => {
        // Two users on the same issuer — the sender's IdP should
        // route the welcome via the local `mls_welcomes` insert (not
        // the AP `Create{Note}` path). Mirrors the `is_local` branch
        // in `crates/e2ee/src/ds.rs::post_welcome`.
        const directory = new InMemoryKeyDirectory()
        const sharedIssuer = "https://idp.shared.example"
        directory.senderIssuer = sharedIssuer
        const aliceLocal: ActorUri = asActorUri(`${sharedIssuer}/users/alice_local`)
        const bobLocal: ActorUri = asActorUri(`${sharedIssuer}/users/bob_local`)

        const alice = await buildAdapter(directory, "alice-token", aliceLocal)
        const bob = await buildAdapter(directory, "bob-token", bobLocal)

        await alice.e2ee.register(sharedIssuer, "alice-token", aliceLocal)
        await bob.e2ee.register(sharedIssuer, "bob-token", bobLocal)
        await alice.e2ee.addContactToGroup(sharedIssuer, "alice-token", conversationId, bobLocal)

        expect(directory.welcomeRouting).toHaveLength(1)
        expect(directory.welcomeRouting[0].path).toBe("local")
        expect(directory.welcomeRouting[0].recipient_actor_uri).toBe(bobLocal)

        // Round-trip the welcome end-to-end so we know the local
        // path actually delivers + the receiver can decrypt.
        const consumed = await bob.e2ee.consumePendingWelcomes(sharedIssuer, "bob-token", bobLocal)
        expect(consumed.joined).toBe(1)
        expect(await bob.mls.getEpoch(conversationId)).toBe(await alice.mls.getEpoch(conversationId))
    })
})

describe("MLS E2EE — committing a removed member's devices out", () => {
    const conversationId: ConversationId = "aaaa1111-2222-3333-4444-555566667777"
    const issuer = "https://idp.shared.example"
    const [aliceActor, bobActor, carolActor] = ["alice", "bob", "carol"].map((name) =>
        asActorUri(`${issuer}/users/${name}_x1y2z`),
    )
    const text = (t: string): ApplicationMessage<TextBody> => ({ version: 1, kind: "text", body: { text: t } })
    const catchUp = (accessToken: string) => ({ idpUrl: issuer, accessToken })
    const read = async (ctx: AdapterCtx, token: string, ciphertext: Uint8Array) =>
        ((await ctx.e2ee.decryptInbound(conversationId, ciphertext, catchUp(token)))?.body as TextBody).text

    /** Alice's group, with Bob and Carol in it. */
    async function crew() {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const alice = await buildAdapter(directory, "alice-token", aliceActor)
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        const carol = await buildAdapter(directory, "carol-token", carolActor)
        for (const [ctx, token, actor] of [
            [alice, "alice-token", aliceActor],
            [bob, "bob-token", bobActor],
            [carol, "carol-token", carolActor],
        ] as const) {
            await ctx.e2ee.register(issuer, token, actor)
        }
        await alice.e2ee.addContactToGroup(issuer, "alice-token", conversationId, bobActor)
        await bob.e2ee.consumePendingWelcomes(issuer, "bob-token", bobActor)
        await alice.e2ee.addContactToGroup(issuer, "alice-token", conversationId, carolActor)
        await carol.e2ee.consumePendingWelcomes(issuer, "carol-token", carolActor)
        return { directory, alice, bob, carol }
    }

    it("leaves the others reading on, and the one removed reading nothing", async () => {
        const { alice, bob, carol } = await crew()

        const pruned = await alice.e2ee.pruneGroup(issuer, "alice-token", conversationId, [aliceActor, bobActor])

        expect(pruned).toEqual({ removed: 1 })
        const after = await alice.e2ee.encryptOutbound(conversationId, text("after"))
        expect(await read(bob, "bob-token", after)).toBe("after")
        await expect(read(carol, "carol-token", after)).rejects.toThrow()
        expect(
            await alice.e2ee.pruneGroup(issuer, "alice-token", conversationId, [aliceActor, bobActor]),
        ).toEqual({ removed: 0 })
    })

    it("can commit again after a commit lost on its way", async () => {
        const { directory, alice, bob } = await crew()
        directory.failNextCommit = true

        await expect(
            alice.e2ee.pruneGroup(issuer, "alice-token", conversationId, [aliceActor, bobActor]),
        ).rejects.toThrow("connection reset")

        const still = await alice.e2ee.encryptOutbound(conversationId, text("still here"))
        expect(await read(bob, "bob-token", still)).toBe("still here")
        expect(
            await alice.e2ee.pruneGroup(issuer, "alice-token", conversationId, [aliceActor, bobActor]),
        ).toEqual({ removed: 1 })
    })

    it("can commit again after a device revocation whose commit was lost", async () => {
        const { directory, alice, carol } = await crew()
        const carolsDevice = await carol.storage.getOrCreateDeviceId()
        directory.failNextCommit = true

        const revoked = await alice.e2ee.revokeDevice(issuer, "alice-token", carolActor, carolsDevice, [
            conversationId,
        ])

        expect(revoked.removed_from).toEqual([])
        expect(
            await alice.e2ee.pruneGroup(issuer, "alice-token", conversationId, [aliceActor, bobActor]),
        ).toEqual({ removed: 1 })
    })

    it("has the second of two admins pruning at once catch up and find nothing left to do", async () => {
        const { alice, bob } = await crew()
        await read(bob, "bob-token", await alice.e2ee.encryptOutbound(conversationId, text("hi")))

        const first = await alice.e2ee.pruneGroup(issuer, "alice-token", conversationId, [aliceActor, bobActor])
        const second = await bob.e2ee.pruneGroup(issuer, "bob-token", conversationId, [aliceActor, bobActor])

        expect([first, second]).toEqual([{ removed: 1 }, { removed: 0 }])
        expect(await bob.mls.getEpoch(conversationId)).toBe(await alice.mls.getEpoch(conversationId))
        expect(await read(bob, "bob-token", await alice.e2ee.encryptOutbound(conversationId, text("on"))))
            .toBe("on")
    })

    it("lets a member removed and added back read again", async () => {
        const { alice, carol } = await crew()
        await alice.e2ee.pruneGroup(issuer, "alice-token", conversationId, [aliceActor, bobActor])

        await alice.e2ee.addContactToGroup(issuer, "alice-token", conversationId, carolActor)
        await carol.e2ee.consumePendingWelcomes(issuer, "carol-token", carolActor)

        expect(await read(carol, "carol-token", await alice.e2ee.encryptOutbound(conversationId, text("back"))))
            .toBe("back")
    })

    it("leaves none of the group's keys on a device that cleared it", async () => {
        const { alice, carol } = await crew()
        await alice.e2ee.pruneGroup(issuer, "alice-token", conversationId, [aliceActor, bobActor])

        await carol.e2ee.forgetGroup(conversationId)

        expect(await carol.mls.hasGroup(conversationId)).toBe(false)
        expect((await carol.storage.loadMlsSnapshot())?.known_group_ids).toEqual([])
        await alice.e2ee.addContactToGroup(issuer, "alice-token", conversationId, carolActor)
        await carol.e2ee.consumePendingWelcomes(issuer, "carol-token", carolActor)
        expect(await read(carol, "carol-token", await alice.e2ee.encryptOutbound(conversationId, text("anew"))))
            .toBe("anew")
    })
})

describe("MLS E2EE — a device signs a group with the key its leaf carries", () => {
    const conversationId: ConversationId = "bbbb1111-2222-3333-4444-555566667777"
    const issuer = "https://idp.shared.example"
    const [aliceActor, bobActor] = ["alice", "bob"].map((name) => asActorUri(`${issuer}/users/${name}_x1y2z`))
    const text = (t: string): ApplicationMessage<TextBody> => ({ version: 1, kind: "text", body: { text: t } })
    const read = async (ctx: AdapterCtx, token: string, ciphertext: Uint8Array) =>
        ((await ctx.e2ee.decryptInbound(conversationId, ciphertext, { idpUrl: issuer, accessToken: token }))
            ?.body as TextBody).text

    async function pair() {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const alice = await buildAdapter(directory, "alice-token", aliceActor)
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        await alice.e2ee.register(issuer, "alice-token", aliceActor)
        await bob.e2ee.register(issuer, "bob-token", bobActor)
        return { directory, alice, bob }
    }

    it("is read after a reload that came before the device joined anything", async () => {
        const { directory, alice, bob } = await pair()
        const reloaded = await reload(directory, bob)
        await reloaded.e2ee.consumePendingWelcomes(issuer, "bob-token", bobActor)

        await alice.e2ee.addContactToGroup(issuer, "alice-token", conversationId, bobActor)
        await reloaded.e2ee.consumePendingWelcomes(issuer, "bob-token", bobActor)

        expect(await read(alice, "alice-token", await reloaded.e2ee.encryptOutbound(conversationId, text("hi"))))
            .toBe("hi")
    })

    it("is read after a reload on a device whose stored id isn't the one its leaf carries", async () => {
        const { directory, alice, bob } = await pair()
        await alice.e2ee.addContactToGroup(issuer, "alice-token", conversationId, bobActor)
        await bob.e2ee.consumePendingWelcomes(issuer, "bob-token", bobActor)
        bob.storage.replaceDeviceId(crypto.randomUUID())

        const reloaded = await reload(directory, bob)
        await reloaded.e2ee.consumePendingWelcomes(issuer, "bob-token", bobActor)

        expect(await read(alice, "alice-token", await reloaded.e2ee.encryptOutbound(conversationId, text("hi"))))
            .toBe("hi")
    })
})

describe("MLS E2EE — a device keeps its KeyPackage stash topped up", () => {
    const conversationId: ConversationId = "cccc1111-2222-3333-4444-555566667777"
    const issuer = "https://idp.shared.example"
    const [aliceActor, bobActor] = ["alice", "bob"].map((name) => asActorUri(`${issuer}/users/${name}_x1y2z`))
    const text = (t: string): ApplicationMessage<TextBody> => ({ version: 1, kind: "text", body: { text: t } })

    async function pair() {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const alice = await buildAdapter(directory, "alice-token", aliceActor)
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        await alice.e2ee.register(issuer, "alice-token", aliceActor)
        await bob.e2ee.register(issuer, "bob-token", bobActor)
        return { directory, alice, bob }
    }

    it("can be added again once a reloaded device refilled the stash the server lost", async () => {
        const { directory, alice, bob } = await pair()
        directory.forgetPackages(bobActor)

        const reloaded = await reload(directory, bob)
        await reloaded.e2ee.replenishKeyPackages(issuer, "bob-token", bobActor)
        const again = await reload(directory, reloaded)
        await alice.e2ee.addContactToGroup(issuer, "alice-token", conversationId, bobActor)
        await again.e2ee.consumePendingWelcomes(issuer, "bob-token", bobActor)

        const read = await alice.e2ee.decryptInbound(
            conversationId,
            await again.e2ee.encryptOutbound(conversationId, text("hi")),
            { idpUrl: issuer, accessToken: "alice-token" },
        )
        expect((read?.body as TextBody).text).toBe("hi")
    })

    it("fills the stash once when asked twice at once", async () => {
        const { directory, bob } = await pair()
        directory.forgetPackages(bobActor)

        await Promise.all([
            bob.e2ee.replenishKeyPackages(issuer, "bob-token", bobActor),
            bob.e2ee.replenishKeyPackages(issuer, "bob-token", bobActor),
        ])

        expect(directory.packagesOf(bobActor)).toBe(100)
    })

    it("can still be added through what it published when the tab dies as the server stores it", async () => {
        const { directory, alice, bob } = await pair()
        directory.forgetPackages(bobActor)
        let onDisk: MlsSnapshot | null = null
        const upload = directory.uploadKeyPackages.bind(directory)
        directory.uploadKeyPackages = async (...args) => {
            onDisk = await bob.storage.loadMlsSnapshot()
            return upload(...args)
        }

        await bob.e2ee.replenishKeyPackages(issuer, "bob-token", bobActor)
        await bob.storage.saveMlsSnapshot(onDisk!)
        const reloaded = await reload(directory, bob)
        await alice.e2ee.addContactToGroup(issuer, "alice-token", conversationId, bobActor)
        const { joined } = await reloaded.e2ee.consumePendingWelcomes(issuer, "bob-token", bobActor)

        expect(joined).toBe(1)
    })

    it("publishes nothing it could not save", async () => {
        const { directory, bob } = await pair()
        directory.forgetPackages(bobActor)
        bob.storage.saveMlsSnapshot = async () => {
            throw new Error("quota exceeded")
        }

        await expect(bob.e2ee.replenishKeyPackages(issuer, "bob-token", bobActor)).rejects.toThrow("quota exceeded")
        expect(directory.packagesOf(bobActor)).toBe(0)
    })
})

describe("MLS E2EE — a user's devices bring each other into their groups", () => {
    const conversationId: ConversationId = "dddd1111-2222-3333-4444-555566667777"
    const issuer = "https://idp.shared.example"
    const [bobActor, danActor] = ["bob", "dan"].map((name) => asActorUri(`${issuer}/users/${name}_x1y2z`))
    const text = (t: string): ApplicationMessage<TextBody> => ({ version: 1, kind: "text", body: { text: t } })
    const read = async (ctx: AdapterCtx, token: string, ciphertext: Uint8Array) =>
        ((await ctx.e2ee.decryptInbound(conversationId, ciphertext, { idpUrl: issuer, accessToken: token }))
            ?.body as TextBody).text

    /**
     * Bob and Dan's conversation, with Dan on one device; a second device of Dan's just signed in.
     * Both hold the account's words, so a verdict of theirs acts.
     */
    async function secondDevice() {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const history = new FakeHistoryIdp()
        const account = await accountKey(history)
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        const dan1 = await buildAdapter(directory, "dan1-token", danActor, history)
        await bob.e2ee.register(issuer, "bob-token", bobActor)
        await dan1.e2ee.register(issuer, "dan1-token", danActor)
        await bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor)
        await dan1.e2ee.consumePendingWelcomes(issuer, "dan1-token", danActor)
        const dan2 = await buildAdapter(directory, "dan2-token", danActor, history)
        await dan2.e2ee.register(issuer, "dan2-token", danActor)
        await account.hold(dan1)
        await account.hold(dan2)
        const ids = {
            dan1: await dan1.storage.getOrCreateDeviceId(),
            dan2: await dan2.storage.getOrCreateDeviceId(),
        }
        return { directory, bob, dan1, dan2, ids }
    }

    it("brings the new device in, reading and read from then on", async () => {
        const { bob, dan1, dan2 } = await secondDevice()

        const added = await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, await trusting(dan1, dan2))
        await dan2.e2ee.consumePendingWelcomes(issuer, "dan2-token", danActor)

        expect(added).toEqual({ added: 1, unclaimed: [] })
        const fromDan2 = await dan2.e2ee.encryptOutbound(conversationId, text("from dan2"))
        expect(await read(bob, "bob-token", fromDan2)).toBe("from dan2")
        expect(await read(dan1, "dan1-token", fromDan2)).toBe("from dan2")
        const fromBob = await bob.e2ee.encryptOutbound(conversationId, text("from bob"))
        expect(await read(dan2, "dan2-token", fromBob)).toBe("from bob")
        expect(await read(dan1, "dan1-token", fromBob)).toBe("from bob")
        expect(await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, await trusting(dan1, dan2))).toEqual({
            added: 0,
            unclaimed: [],
        })
    })

    it("founds no group on a device that holds none", async () => {
        const { directory, dan1, dan2 } = await secondDevice()
        const packages = directory.packagesOf(danActor)
        const commits = (await directory.getCommitsSince(issuer, "dan2-token", conversationId, 0)).commits.length

        const added = await dan2.e2ee.addOwnDevices(issuer, "dan2-token", conversationId, await trusting(dan2, dan1))

        expect(added).toEqual({ added: 0, unclaimed: [] })
        expect(await dan2.mls.hasGroup(conversationId)).toBe(false)
        expect(directory.packagesOf(danActor)).toBe(packages)
        expect((await directory.getCommitsSince(issuer, "dan2-token", conversationId, 0)).commits).toHaveLength(
            commits,
        )
    })

    it("has the second of two devices adding a third at once catch up and find nothing left to do", async () => {
        const { directory, bob, dan1, dan2 } = await secondDevice()
        await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, await trusting(dan1, dan2))
        await dan2.e2ee.consumePendingWelcomes(issuer, "dan2-token", danActor)
        const dan3 = await buildAdapter(directory, "dan3-token", danActor)
        await dan3.e2ee.register(issuer, "dan3-token", danActor)

        const first = await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, await trusting(dan1, dan2, dan3))
        const second = await dan2.e2ee.addOwnDevices(issuer, "dan2-token", conversationId, await trusting(dan2, dan1, dan3))
        await dan3.e2ee.consumePendingWelcomes(issuer, "dan3-token", danActor)

        expect([first, second]).toEqual([
            { added: 1, unclaimed: [] },
            { added: 0, unclaimed: [] },
        ])
        expect(await dan2.mls.getEpoch(conversationId)).toBe(await dan1.mls.getEpoch(conversationId))
        const fromDan3 = await dan3.e2ee.encryptOutbound(conversationId, text("from dan3"))
        expect(await read(bob, "bob-token", fromDan3)).toBe("from dan3")
        expect(await read(dan2, "dan2-token", fromDan3)).toBe("from dan3")
    })

    it("can add the device again after a commit lost on its way", async () => {
        const { directory, bob, dan1, dan2 } = await secondDevice()
        directory.failNextCommit = true

        await expect(
            dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, await trusting(dan1, dan2)),
        ).rejects.toThrow("connection reset")

        expect(await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, await trusting(dan1, dan2))).toEqual({
            added: 1,
            unclaimed: [],
        })
        await dan2.e2ee.consumePendingWelcomes(issuer, "dan2-token", danActor)
        expect(await read(bob, "bob-token", await dan2.e2ee.encryptOutbound(conversationId, text("in"))))
            .toBe("in")
    })

    it("adds the device once when asked twice at once", async () => {
        const { directory, dan1, dan2, ids } = await secondDevice()
        const trust = await trusting(dan1, dan2)

        const runs = await Promise.all([
            dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, trust),
            dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, trust),
        ])

        expect(runs.map((r) => r.added).sort()).toEqual([0, 1])
        expect(directory.welcomeRouting.filter((w) => w.recipient_device_id === ids.dan2)).toHaveLength(1)
    })

    it("has a member who missed the add catch up when told, and be read by the new device", async () => {
        const { bob, dan1, dan2 } = await secondDevice()
        await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, await trusting(dan1, dan2))
        await dan2.e2ee.consumePendingWelcomes(issuer, "dan2-token", danActor)

        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)

        expect(await bob.mls.getEpoch(conversationId)).toBe(await dan1.mls.getEpoch(conversationId))
        expect(await read(dan2, "dan2-token", await bob.e2ee.encryptOutbound(conversationId, text("first"))))
            .toBe("first")
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)
        await dan2.e2ee.catchUp(issuer, "dan2-token", "eeee1111-2222-3333-4444-555566667777")
    })

    it("brings every device of a contact's into a first add, each reading and read", async () => {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        const dan1 = await buildAdapter(directory, "dan1-token", danActor)
        const dan2 = await buildAdapter(directory, "dan2-token", danActor)
        await bob.e2ee.register(issuer, "bob-token", bobActor)
        await dan1.e2ee.register(issuer, "dan1-token", danActor)
        await dan2.e2ee.register(issuer, "dan2-token", danActor)

        await bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor)
        await dan1.e2ee.consumePendingWelcomes(issuer, "dan1-token", danActor)
        await dan2.e2ee.consumePendingWelcomes(issuer, "dan2-token", danActor)

        const fromBob = await bob.e2ee.encryptOutbound(conversationId, text("to both"))
        expect(await read(dan1, "dan1-token", fromBob)).toBe("to both")
        expect(await read(dan2, "dan2-token", fromBob)).toBe("to both")
        expect(await read(bob, "bob-token", await dan2.e2ee.encryptOutbound(conversationId, text("back"))))
            .toBe("back")
    })

    it("tells when the device comes to hold a group, founded or joined, once", async () => {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        const dan = await buildAdapter(directory, "dan1-token", danActor)
        await bob.e2ee.register(issuer, "bob-token", bobActor)
        await dan.e2ee.register(issuer, "dan1-token", danActor)
        const held: string[] = []
        bob.e2ee.onGroupHeld((id) => held.push(`bob ${id}`))
        const stop = dan.e2ee.onGroupHeld((id) => held.push(`dan ${id}`))

        await bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor)
        await dan.e2ee.consumePendingWelcomes(issuer, "dan1-token", danActor)
        await bob.e2ee.ensureGroupExists(issuer, "bob-token", conversationId, danActor)
        stop()
        await dan.e2ee.consumePendingWelcomes(issuer, "dan1-token", danActor)

        expect(held).toEqual([`bob ${conversationId}`, `dan ${conversationId}`])
    })

    it("keeps no group on a device that lost the race to found one, and joins the real one", async () => {
        const { bob, dan1, dan2 } = await secondDevice()

        await expect(
            dan2.e2ee.ensureGroupExists(issuer, "dan2-token", conversationId, bobActor),
        ).rejects.toThrow()

        expect(await dan2.mls.hasGroup(conversationId)).toBe(false)
        // Tried again, it fails again rather than send into a group nobody else is in.
        await expect(
            dan2.e2ee.ensureGroupExists(issuer, "dan2-token", conversationId, bobActor),
        ).rejects.toThrow()
        await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, await trusting(dan1, dan2))
        await dan2.e2ee.consumePendingWelcomes(issuer, "dan2-token", danActor)
        expect(await read(bob, "bob-token", await dan2.e2ee.encryptOutbound(conversationId, text("in at last"))))
            .toBe("in at last")
    })

    it("founds a conversation once when two sends start it at once", async () => {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        const dan = await buildAdapter(directory, "dan1-token", danActor)
        await bob.e2ee.register(issuer, "bob-token", bobActor)
        await dan.e2ee.register(issuer, "dan1-token", danActor)

        await Promise.all([
            bob.e2ee.ensureGroupExists(issuer, "bob-token", conversationId, danActor),
            bob.e2ee.ensureGroupExists(issuer, "bob-token", conversationId, danActor),
        ])

        expect(await bob.mls.hasGroup(conversationId)).toBe(true)
        await dan.e2ee.consumePendingWelcomes(issuer, "dan1-token", danActor)
        expect(await read(dan, "dan1-token", await bob.e2ee.encryptOutbound(conversationId, text("once"))))
            .toBe("once")
    })

    it("keeps no group when the first add finds no KeyPackage", async () => {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        await bob.e2ee.register(issuer, "bob-token", bobActor)

        await expect(
            bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor),
        ).rejects.toThrow("No KeyPackage")

        expect(await bob.mls.hasGroup(conversationId)).toBe(false)
    })

    it("applies none of its own commits while it is still making one", async () => {
        const { directory, bob, dan1, dan2 } = await secondDevice()
        let stored!: () => void
        const commitStored = new Promise<void>((resolve) => (stored = resolve))
        let release!: () => void
        directory.afterCommitStored = () => {
            stored()
            return new Promise<void>((resolve) => (release = resolve))
        }
        const warn = vi.spyOn(console, "warn")

        const adding = dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, await trusting(dan1, dan2))
        await commitStored
        // The DS pushes `mls_commit` the moment the commit is stored, to its sender's devices too.
        const caughtUp = dan1.e2ee.catchUp(issuer, "dan1-token", conversationId)
        // Held until the catch-up is done — or, queued behind the commit, has waited long enough.
        await Promise.race([caughtUp, new Promise((resolve) => setTimeout(resolve, 300))])
        directory.afterCommitStored = null
        release()
        await Promise.all([adding, caughtUp])

        const catchUpFailures = warn.mock.calls.filter(([m]) => String(m).includes("catchUpCommits"))
        warn.mockRestore()
        expect(catchUpFailures).toEqual([])
        await dan2.e2ee.consumePendingWelcomes(issuer, "dan2-token", danActor)
        expect(await read(bob, "bob-token", await dan2.e2ee.encryptOutbound(conversationId, text("in step"))))
            .toBe("in step")
    })

    it("lets a contact's add be tried again after its commit was lost", async () => {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        const dan = await buildAdapter(directory, "dan1-token", danActor)
        await bob.e2ee.register(issuer, "bob-token", bobActor)
        await dan.e2ee.register(issuer, "dan1-token", danActor)
        directory.failNextCommit = true

        await expect(
            bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor),
        ).rejects.toThrow("connection reset")

        await bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor)
        await dan.e2ee.consumePendingWelcomes(issuer, "dan1-token", danActor)
        expect(await read(dan, "dan1-token", await bob.e2ee.encryptOutbound(conversationId, text("hi"))))
            .toBe("hi")
    })
})

describe("MLS E2EE — a message overtaken by a commit", () => {
    const conversationId: ConversationId = "eeee1111-2222-3333-4444-555566667777"
    const issuer = "https://idp.shared.example"
    const [bobActor, danActor] = ["bob", "dan"].map((name) => asActorUri(`${issuer}/users/${name}_x1y2z`))
    const text = (t: string): ApplicationMessage<TextBody> => ({ version: 1, kind: "text", body: { text: t } })
    const read = async (ctx: AdapterCtx, token: string, ciphertext: Uint8Array) =>
        ((await ctx.e2ee.decryptInbound(conversationId, ciphertext, { idpUrl: issuer, accessToken: token }))
            ?.body as TextBody).text

    /** Bob's conversation with Dan, who joined from Bob's Welcome. */
    async function pair() {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        const dan = await buildAdapter(directory, "dan-token", danActor)
        await bob.e2ee.register(issuer, "bob-token", bobActor)
        await dan.e2ee.register(issuer, "dan-token", danActor)
        await bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor)
        await dan.e2ee.consumePendingWelcomes(issuer, "dan-token", danActor)
        return { directory, bob, dan }
    }

    /** `n` commits by `by`, each moving the group on an epoch, as an add or a removal does. */
    async function commits(directory: InMemoryKeyDirectory, by: AdapterCtx, token: string, n: number) {
        for (let i = 0; i < n; i++) {
            const commit = await by.mls.update(conversationId)
            const epoch = Number(await by.mls.getEpoch(conversationId)) + 1
            await directory.postCommit(issuer, token, conversationId, epoch, commit)
            await by.mls.mergePendingCommit(conversationId)
        }
    }

    it("is read once the commit that overtook it is applied", async () => {
        const { directory, bob, dan } = await pair()
        const sent = await bob.e2ee.encryptOutbound(conversationId, text("before the commit"))
        await commits(directory, bob, "bob-token", 1)

        await dan.e2ee.catchUp(issuer, "dan-token", conversationId)

        expect(await read(dan, "dan-token", sent)).toBe("before the commit")
    })

    it("is read by the group's founder too", async () => {
        const { directory, bob, dan } = await pair()
        const sent = await dan.e2ee.encryptOutbound(conversationId, text("before the commit"))
        await commits(directory, dan, "dan-token", 1)

        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)

        expect(await read(bob, "bob-token", sent)).toBe("before the commit")
    })

    it("is read five commits behind, and not six", async () => {
        const { directory, bob, dan } = await pair()
        const fiveBehind = await bob.e2ee.encryptOutbound(conversationId, text("five behind"))
        await commits(directory, bob, "bob-token", 5)
        await dan.e2ee.catchUp(issuer, "dan-token", conversationId)
        // Read before the next commits, which would take its epoch out of the window.
        expect(await read(dan, "dan-token", fiveBehind)).toBe("five behind")

        const sixBehind = await bob.e2ee.encryptOutbound(conversationId, text("six behind"))
        await commits(directory, bob, "bob-token", 6)
        await dan.e2ee.catchUp(issuer, "dan-token", conversationId)

        await expect(read(dan, "dan-token", sixBehind)).rejects.toThrow()
    })
})

describe("MLS E2EE — a leaf is trusted on its attestation and its leaf binding", () => {
    const conversationId: ConversationId = "ffff1111-2222-3333-4444-555566667777"
    const issuer = "https://idp.shared.example"
    const [bobActor, danActor, eveActor, frankActor] = ["bob", "dan", "eve", "frank"].map((name) =>
        asActorUri(`${issuer}/users/${name}_x1y2z`),
    )
    const text = (t: string): ApplicationMessage<TextBody> => ({ version: 1, kind: "text", body: { text: t } })
    const read = async (ctx: AdapterCtx, token: string, ciphertext: Uint8Array) =>
        ((await ctx.e2ee.decryptInbound(conversationId, ciphertext, { idpUrl: issuer, accessToken: token }))
            ?.body as TextBody).text
    const inAYearAndADay = () => wholeSeconds(new Date(Date.now() + 366 * 86_400_000))

    /** A gate: `opened` resolves once `open` is called. */
    function gate() {
        let open!: () => void
        const opened = new Promise<void>((resolve) => (open = resolve))
        return { opened, open }
    }

    async function registered(directory: InMemoryKeyDirectory, token: string, actor: ActorUri) {
        const ctx = await buildAdapter(directory, token, actor)
        await ctx.e2ee.register(issuer, token, actor)
        return ctx
    }

    /** What an instance could serve: the device's own credential, attested and all, over a leaf key of its making. */
    async function forgedPackage(victim: AdapterCtx): Promise<Uint8Array> {
        const { credential } = await victim.mls.inspectKeyPackage(await victim.mls.createKeyPackage())
        const forger = new MlsAdapter()
        await forger.initialize({ module_or_path: wasmModule } as never)
        const key = await forger.generateSignatureKey()
        await forger.setIdentity(credential!, key)
        return forger.createKeyPackage()
    }

    /** A commit made with the engine alone, as a client that checks nothing would make it. */
    async function commitUnchecked(directory: InMemoryKeyDirectory, by: AdapterCtx, token: string, commit: Uint8Array) {
        const epoch = Number(await by.mls.getEpoch(conversationId)) + 1
        await directory.postCommit(issuer, token, conversationId, epoch, commit)
        await by.mls.mergePendingCommit(conversationId)
    }

    /** Bob's conversation with Dan, whose device holds his account's words. */
    async function bobWithDan() {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const history = new FakeHistoryIdp()
        const bob = await registered(directory, "bob-token", bobActor)
        const dan = await buildAdapter(directory, "dan-token", danActor, history)
        await dan.e2ee.register(issuer, "dan-token", danActor)
        await (await accountKey(history)).hold(dan)
        await bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor)
        await dan.e2ee.consumePendingWelcomes(issuer, "dan-token", danActor)
        return { directory, bob, dan }
    }

    it("publishes KeyPackages whose leaves verify as the device's own", async () => {
        const directory = new InMemoryKeyDirectory()
        const dan = await registered(directory, "dan-token", danActor)
        const danId = await dan.storage.getOrCreateDeviceId()

        const claimed = await directory.claimKeyPackage(issuer, "bob-token", danActor, danId)
        const verdict = await verifyLeafCredential(await dan.mls.inspectKeyPackage(claimed.key_package), issuers.jwks)

        expect(verdict).toMatchObject({ ok: true, actorUri: danActor, deviceId: danId })
        const attestation = (await dan.storage.loadDeviceAttestation())!
        expect(attestation.hpke?.public_key).toHaveLength(32)
        expect(attestation.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    })

    it("adds no KeyPackage pairing a device's credential with a leaf key of the instance's own", async () => {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const bob = await registered(directory, "bob-token", bobActor)
        const dan = await registered(directory, "dan-token", danActor)
        directory.stash(danActor, await dan.storage.getOrCreateDeviceId(), [await forgedPackage(dan)])

        await expect(
            bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor),
        ).rejects.toBeInstanceOf(KeyPackageUnavailable)

        expect(await bob.mls.hasGroup(conversationId)).toBe(false)
        expect(directory.welcomeRouting).toEqual([])
    })

    it("adds those of a contact's devices whose leaves verify, and none of the others", async () => {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const bob = await registered(directory, "bob-token", bobActor)
        const dan1 = await registered(directory, "dan1-token", danActor)
        const dan2 = await registered(directory, "dan2-token", danActor)
        const [dan1Id, dan2Id] = [await dan1.storage.getOrCreateDeviceId(), await dan2.storage.getOrCreateDeviceId()]
        directory.stash(danActor, dan2Id, [await forgedPackage(dan2)])

        await bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor)

        expect(directory.welcomeRouting.map((w) => w.recipient_device_id)).toEqual([dan1Id])
        await dan1.e2ee.consumePendingWelcomes(issuer, "dan1-token", danActor)
        expect(await read(dan1, "dan1-token", await bob.e2ee.encryptOutbound(conversationId, text("hi")))).toBe("hi")
    })

    it("brings in none of the user's own devices whose KeyPackage doesn't verify", async () => {
        const { directory, dan } = await bobWithDan()
        const dan2 = await registered(directory, "dan2-token", danActor)
        const dan2Id = await dan2.storage.getOrCreateDeviceId()
        directory.stash(danActor, dan2Id, [await forgedPackage(dan2)])

        expect(await dan.e2ee.addOwnDevices(issuer, "dan-token", conversationId, await trusting(dan, dan2))).toEqual({ added: 0, unclaimed: [] })
        expect(directory.welcomeRouting.filter((w) => w.recipient_device_id === dan2Id)).toEqual([])
        // Its own KeyPackage, the same verdict: added.
        directory.stash(danActor, dan2Id, [await dan2.mls.createKeyPackage()])
        expect(await dan.e2ee.addOwnDevices(issuer, "dan-token", conversationId, await trusting(dan, dan2))).toEqual({ added: 1, unclaimed: [] })
    })

    it("announces a leaf a commit brings in that fails its checks, and the same leaf met in a Welcome's tree", async () => {
        const { directory, bob, dan } = await bobWithDan()
        const eve = await registered(directory, "eve-token", eveActor)
        const eveId = await eve.storage.getOrCreateDeviceId()
        const metByDan = untrustedLeavesOf(dan)
        const forged = await bob.mls.addMember(conversationId, await forgedPackage(eve))
        await commitUnchecked(directory, bob, "bob-token", forged.commit)

        await dan.e2ee.catchUp(issuer, "dan-token", conversationId)

        expect(metByDan).toMatchObject([
            { conversationId, leafIndex: 2, actorUri: eveActor, deviceId: eveId, reason: "binding" },
        ])
        const later = untrustedLeavesOf(dan)
        expect(later).toEqual(metByDan)
        // Still in the group: committing it out is a run of its own.
        expect(await read(dan, "dan-token", await bob.e2ee.encryptOutbound(conversationId, text("on")))).toBe("on")

        const frank = await registered(directory, "frank-token", frankActor)
        const metByFrank = untrustedLeavesOf(frank)
        await bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, frankActor)
        await frank.e2ee.consumePendingWelcomes(issuer, "frank-token", frankActor)

        expect(metByFrank.map((leaf) => [leaf.leafIndex, leaf.reason])).toEqual([[2, "binding"]])

        // Committed out, the leaf is no longer held against the group.
        await commitUnchecked(directory, bob, "bob-token", await bob.mls.removeMember(conversationId, 2))
        await dan.e2ee.catchUp(issuer, "dan-token", conversationId)
        const afterRemoval = untrustedLeavesOf(dan)
        expect(afterRemoval).toEqual([])
    })

    it("refreshes its own leaf once its attestation was renewed, and its peers trust the new one", async () => {
        const { bob, dan } = await bobWithDan()
        const danId = await dan.storage.getOrCreateDeviceId()
        const held = (await dan.storage.loadDeviceAttestation())!
        const renewed = issuers.attest(danActor, danId, held.drk_public, wholeSeconds(new Date(Date.now() + 200 * 86_400_000)))
        await dan.storage.saveDeviceAttestation({ ...held, ...renewed })
        const metByBob = untrustedLeavesOf(bob)

        expect(await dan.e2ee.refreshOwnLeaf(issuer, "dan-token", conversationId)).toEqual({ refreshed: true })
        expect(await dan.e2ee.refreshOwnLeaf(issuer, "dan-token", conversationId)).toEqual({ refreshed: false })
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)

        expect(metByBob).toEqual([])
        const dansLeaf = (await bob.mls.groupLeaves(conversationId)).find((leaf) => leaf.credential?.device_id === danId)
        expect(dansLeaf?.credential?.idp_att.expires_at).toBe(renewed.expires_at)
        expect(await read(bob, "bob-token", await dan.e2ee.encryptOutbound(conversationId, text("renewed")))).toBe(
            "renewed",
        )
    })

    it("puts a credential its peers trust in place of one they don't", async () => {
        const { directory, bob, dan } = await bobWithDan()
        const own = (await dan.mls.groupLeaves(conversationId)).find((leaf) => leaf.own)!
        const unbound = { ...own.credential!, leaf_binding: bytesToBase64(new Uint8Array(64)) }
        await commitUnchecked(directory, dan, "dan-token", await dan.mls.updateOwnCredential(conversationId, unbound))
        const metByBob = untrustedLeavesOf(bob)
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)
        expect(metByBob.map((leaf) => leaf.reason)).toEqual(["binding"])

        expect(await dan.e2ee.refreshOwnLeaf(issuer, "dan-token", conversationId)).toEqual({ refreshed: true })
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)

        expect(metByBob).toHaveLength(1)
        const dansLeaf = (await bob.mls.groupLeaves(conversationId)).find((leaf) => leaf.leafIndex === own.leafIndex)!
        expect((await verifyLeafCredential(dansLeaf, issuers.jwks)).ok).toBe(true)
        const late = untrustedLeavesOf(bob)
        expect(late).toEqual([])
    })

    it("refreshes its own leaf after losing an epoch race, once caught up", async () => {
        const { directory, bob, dan } = await bobWithDan()
        const own = (await dan.mls.groupLeaves(conversationId)).find((leaf) => leaf.own)!
        const unbound = { ...own.credential!, leaf_binding: bytesToBase64(new Uint8Array(64)) }
        await commitUnchecked(directory, dan, "dan-token", await dan.mls.updateOwnCredential(conversationId, unbound))
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)
        // Bob takes the next epoch before Dan's refresh does.
        await commitUnchecked(directory, bob, "bob-token", await bob.mls.update(conversationId))

        expect(await dan.e2ee.refreshOwnLeaf(issuer, "dan-token", conversationId)).toEqual({ refreshed: true })

        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)
        expect(await bob.mls.getEpoch(conversationId)).toBe(await dan.mls.getEpoch(conversationId))
        expect(await read(bob, "bob-token", await dan.e2ee.encryptOutbound(conversationId, text("caught up")))).toBe(
            "caught up",
        )
    })

    it("refreshes its own leaf with the attestation a registration under way brings", async () => {
        const { directory, bob, dan } = await bobWithDan()
        const held = (await dan.storage.loadDeviceAttestation())!
        await dan.storage.saveDeviceAttestation({ ...held, hpke: null })
        directory.attestUntil = inAYearAndADay()
        const answer = gate()
        const asked = gate()
        directory.beforeRegistrationAnswers = async () => {
            asked.open()
            await answer.opened
        }
        let registrations = 0
        dan.e2ee.onDeviceRegistered(() => registrations++)

        const registering = dan.e2ee.registerDevice(issuer, "dan-token", danActor)
        await asked.opened
        const refreshing = dan.e2ee.refreshOwnLeaf(issuer, "dan-token", conversationId)
        answer.open()

        await registering
        expect(await refreshing).toEqual({ refreshed: true })
        expect(registrations).toBe(1)
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)
        const dansLeaf = (await bob.mls.groupLeaves(conversationId)).find((leaf) => leaf.credential?.actor_uri === danActor)!
        expect(dansLeaf.credential?.idp_att.expires_at).toBe(directory.attestUntil)
        expect((await verifyLeafCredential(dansLeaf, issuers.jwks)).ok).toBe(true)
    })

    it("fills its stash through a renewal landing mid-refill, every KeyPackage carrying the new attestation", async () => {
        const directory = new InMemoryKeyDirectory()
        const dan = await registered(directory, "dan-token", danActor)
        const danId = await dan.storage.getOrCreateDeviceId()
        directory.forgetPackages(danActor)
        const held = (await dan.storage.loadDeviceAttestation())!
        await dan.storage.saveDeviceAttestation({ ...held, hpke: null })
        directory.attestUntil = inAYearAndADay()
        const statusAsked = gate()
        const statusAnswer = gate()
        const status = directory.getKeyPackageStatus.bind(directory)
        directory.getKeyPackageStatus = async (...args) => {
            statusAsked.open()
            await statusAnswer.opened
            return status(...args)
        }

        const refilling = dan.e2ee.replenishKeyPackages(issuer, "dan-token", danActor)
        await statusAsked.opened
        await dan.e2ee.registerDevice(issuer, "dan-token", danActor)
        statusAnswer.open()
        await refilling

        expect(directory.packagesOf(danActor)).toBe(100)
        const claimed = await directory.claimKeyPackage(issuer, "dan-token", danActor, danId)
        const leaf = await dan.mls.inspectKeyPackage(claimed.key_package)
        expect(leaf.credential?.idp_att.expires_at).toBe(directory.attestUntil)
        expect((await verifyLeafCredential(leaf, issuers.jwks)).ok).toBe(true)
    })

    it("revokes every leaf that names the device", async () => {
        const { directory, bob, dan } = await bobWithDan()
        const dan2 = await registered(directory, "dan2-token", danActor)
        const dan2Id = await dan2.storage.getOrCreateDeviceId()
        // Its own, and one an instance put under its credential with a key of its own.
        for (const keyPackage of [await dan2.mls.createKeyPackage(), await forgedPackage(dan2)]) {
            const add = await bob.mls.addMember(conversationId, keyPackage)
            await commitUnchecked(directory, bob, "bob-token", add.commit)
        }
        await dan.e2ee.catchUp(issuer, "dan-token", conversationId)

        const revoked = await dan.e2ee.revokeDevice(issuer, "dan-token", danActor, dan2Id, [conversationId])

        expect(revoked.removed_from).toEqual([conversationId])
        expect((await dan.mls.groupLeaves(conversationId)).filter((leaf) => leaf.credential?.device_id === dan2Id)).toEqual([])
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)
        expect(await read(bob, "bob-token", await dan.e2ee.encryptOutbound(conversationId, text("two out")))).toBe(
            "two out",
        )
    })

    it("prunes a leaf whose credential names nobody: it can be no member's", async () => {
        const { directory, bob, dan } = await bobWithDan()
        const forger = new MlsAdapter()
        await forger.initialize({ module_or_path: wasmModule } as never)
        const key = await forger.generateSignatureKey()
        const { credential } = await dan.mls.inspectKeyPackage(await dan.mls.createKeyPackage())
        const unreadable = { ...credential!, idp_att: { ...credential!.idp_att, kid: 7 } } as unknown as LeafCredential
        await forger.setIdentity(unreadable, key)
        const add = await bob.mls.addMember(conversationId, await forger.createKeyPackage())
        await commitUnchecked(directory, bob, "bob-token", add.commit)
        expect((await bob.mls.groupLeaves(conversationId)).map((leaf) => leaf.credential === null)).toEqual([
            false,
            false,
            true,
        ])

        const pruned = await bob.e2ee.pruneGroup(issuer, "bob-token", conversationId, [bobActor, danActor])

        expect(pruned).toEqual({ removed: 1 })
        expect(await bob.mls.groupLeaves(conversationId)).toHaveLength(2)
        await dan.e2ee.catchUp(issuer, "dan-token", conversationId)
        expect(await read(dan, "dan-token", await bob.e2ee.encryptOutbound(conversationId, text("pruned")))).toBe(
            "pruned",
        )
    })
})

describe("MLS E2EE — a device acting on approval judges its account's leaves", () => {
    const conversationId: ConversationId = "abab1111-2222-3333-4444-555566667777"
    const issuer = "https://idp.shared.example"
    const [bobActor, danActor, eveActor] = ["bob", "dan", "eve"].map((name) => asActorUri(`${issuer}/users/${name}_x1y2z`))
    const text = (t: string): ApplicationMessage<TextBody> => ({ version: 1, kind: "text", body: { text: t } })
    const read = async (ctx: AdapterCtx, token: string, ciphertext: Uint8Array) =>
        ((await ctx.e2ee.decryptInbound(conversationId, ciphertext, { idpUrl: issuer, accessToken: token }))?.body as TextBody).text

    async function registered(directory: InMemoryKeyDirectory, token: string, actor: ActorUri, history: FakeHistoryIdp | null = null) {
        const ctx = await buildAdapter(directory, token, actor, history)
        await ctx.e2ee.register(issuer, token, actor)
        return ctx
    }

    /** The device as the list shows it, keys and all. */
    async function asListed(ctx: AdapterCtx, actor: ActorUri): Promise<TestDevice> {
        const att = (await ctx.storage.loadDeviceAttestation())!
        return {
            actorUri: actor,
            deviceId: await ctx.storage.getOrCreateDeviceId(),
            rootKey: { secretKey: att.drk_private, publicKey: att.drk_public },
            attestation: att,
        }
    }

    /** A KeyPackage under `device`'s credential, its leaf key bound by that device's root key. */
    async function packageOf(device: TestDevice): Promise<Uint8Array> {
        const maker = new MlsAdapter()
        await maker.initialize({ module_or_path: wasmModule } as never)
        const key = await maker.generateSignatureKey()
        await maker.setIdentity(credentialFor(device, key), key)
        return maker.createKeyPackage()
    }

    /** A commit made with the engine alone, as a client that checks nothing would make it. */
    async function commitUnchecked(directory: InMemoryKeyDirectory, by: AdapterCtx, token: string, commit: Uint8Array) {
        const epoch = Number(await by.mls.getEpoch(conversationId)) + 1
        await directory.postCommit(issuer, token, conversationId, epoch, commit)
        await by.mls.mergePendingCommit(conversationId)
    }

    /**
     * Bob's conversation with Dan's laptop, which holds the account's words (unless `holding` is
     * false) and approved itself; the IdP lists Dan's devices as `rows` says.
     */
    async function danAccount({ holding = true, jwks = issuers.jwks }: { holding?: boolean; jwks?: IJwksCachePort } = {}) {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const history = new FakeHistoryIdp()
        const account = await accountKey(history)
        const bob = await registered(directory, "bob-token", bobActor)
        const laptop = await buildAdapter(directory, "laptop-token", danActor, history, jwks)
        await laptop.e2ee.register(issuer, "laptop-token", danActor)
        if (holding) await account.hold(laptop)
        await bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor)
        await laptop.e2ee.consumePendingWelcomes(issuer, "laptop-token", danActor)
        const self = await asListed(laptop, danActor)
        const rows: DeviceListEntry[] = [listedDevice(self, [approvedByPassphrase(account.hak, 1, self)])]
        const listDevices = vi.fn(async () => ({ devices: [...rows] }))
        const deps = { e2ee: laptop.e2ee, deviceDirectory: { listDevices } }
        const sync = () => syncOwnGroupsUseCase(issuer, "laptop-token", danActor, [conversationId], deps)
        return { directory, history, bob, laptop, self, rows, listDevices, deps, sync }
    }

    /** A sibling registered after Bob's add: in nothing yet. */
    async function sibling(directory: InMemoryKeyDirectory, token: string) {
        const ctx = await registered(directory, token, danActor)
        return { ctx, row: await asListed(ctx, danActor) }
    }

    /** Bob adds a KeyPackage of `device` as a client that checks nothing would, its Welcome sent. */
    async function bobAdds(directory: InMemoryKeyDirectory, bob: AdapterCtx, keyPackage: Uint8Array, deviceId?: DeviceId) {
        const add = await bob.mls.addMember(conversationId, keyPackage)
        await commitUnchecked(directory, bob, "bob-token", add.commit)
        if (deviceId) {
            await directory.postWelcome(issuer, "bob-token", {
                recipient_actor_uri: danActor,
                recipient_device_id: deviceId,
                conversation_id: conversationId,
                welcome_blob: add.welcome,
            })
        }
    }

    /** `victim`'s own credential over a leaf key its root key never bound. */
    async function forgedPackage(victim: AdapterCtx): Promise<Uint8Array> {
        const { credential } = await victim.mls.inspectKeyPackage(await victim.mls.createKeyPackage())
        const forger = new MlsAdapter()
        await forger.initialize({ module_or_path: wasmModule } as never)
        const key = await forger.generateSignatureKey()
        await forger.setIdentity(credential!, key)
        return forger.createKeyPackage()
    }

    /** The issuers' keys, as a device reads them, with the network to them cut at will. */
    function switchableJwks() {
        const net = { up: true }
        const jwks: IJwksCachePort = {
            getKey: async (issuerUrl, kid) => {
                if (!net.up) throw new Error("unreachable")
                return issuers.jwks.getKey(issuerUrl, kid)
            },
            invalidate: () => undefined,
        }
        return { net, jwks }
    }

    const leavesOf = async (ctx: AdapterCtx) =>
        (await ctx.mls.groupLeaves(conversationId)).map((leaf) => [leaf.credential?.device_id, leaf.credential?.drk_pub])

    it("adds a sibling found approved, and never one nobody approved", async () => {
        const { directory, bob, laptop, self, rows, sync } = await danAccount()
        const phone = await registered(directory, "phone-token", danActor)
        const tablet = await registered(directory, "tablet-token", danActor)
        const [phoneRow, tabletRow] = [await asListed(phone, danActor), await asListed(tablet, danActor)]
        rows.push(listedDevice(phoneRow, [approvedBy(self, phoneRow)]), listedDevice(tabletRow))
        const heard = untrustedLeavesOf(laptop)

        const outcome = await sync()
        await phone.e2ee.consumePendingWelcomes(issuer, "phone-token", danActor)

        expect(outcome).toEqual({ added: 1, removed: 0, unclaimed: [], failed: [] })
        expect(directory.welcomeRouting.filter((w) => w.recipient_actor_uri === danActor).map((w) => w.recipient_device_id)).toEqual([
            self.deviceId,
            phoneRow.deviceId,
        ])
        expect(await read(bob, "bob-token", await phone.e2ee.encryptOutbound(conversationId, text("approved")))).toBe("approved")
        expect(heard).toEqual([])
        expect(await tablet.e2ee.consumePendingWelcomes(issuer, "tablet-token", danActor)).toEqual({ joined: 0 })
    })

    it("decides nothing without the passphrase: adds no sibling, commits none of its account's leaves out", async () => {
        const { directory, bob, laptop, self, rows, sync } = await danAccount({ holding: false })
        const phone = await registered(directory, "phone-token", danActor)
        const phoneRow = await asListed(phone, danActor)
        rows.push(listedDevice(phoneRow, [approvedBy(self, phoneRow)]))
        const stranger = testDevice(issuers, danActor)
        await commitUnchecked(directory, bob, "bob-token", (await bob.mls.addMember(conversationId, await packageOf(stranger))).commit)
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)

        expect(await sync()).toEqual({ added: 0, removed: 0, unclaimed: [], failed: [] })
        expect(await leavesOf(laptop)).toContainEqual([stranger.deviceId, bytesToBase64(stranger.rootKey.publicKey)])
    })

    /** A sibling approved with the code: registered, listed approved, its KeyPackages not yet out — it publishes once in. */
    async function approvedNotPublished(directory: InMemoryKeyDirectory, self: TestDevice, rows: DeviceListEntry[]) {
        const phone = await buildAdapter(directory, "phone-token", danActor)
        await phone.e2ee.registerDevice(issuer, "phone-token", danActor)
        const row = await asListed(phone, danActor)
        rows.push(listedDevice(row, [approvedBy(self, row)]))
        return { phone, row, publish: () => phone.e2ee.register(issuer, "phone-token", danActor) }
    }

    it("tells of an approved sibling no KeyPackage could be claimed for, and adds it once its stash lands", async () => {
        const { directory, bob, self, rows, sync } = await danAccount()
        const { phone, row, publish } = await approvedNotPublished(directory, self, rows)

        expect(await sync()).toEqual({ added: 0, removed: 0, unclaimed: [row.deviceId], failed: [] })

        await publish()
        expect(await sync()).toEqual({ added: 1, removed: 0, unclaimed: [], failed: [] })
        await phone.e2ee.consumePendingWelcomes(issuer, "phone-token", danActor)
        expect(await read(bob, "bob-token", await phone.e2ee.encryptOutbound(conversationId, text("in at last")))).toBe("in at last")
    })

    it("adds a sibling whose stash lands mid-run where it can, and tells of the groups it still misses", async () => {
        const { directory, bob, laptop, self, rows, deps } = await danAccount()
        const second: ConversationId = "cdcd1111-2222-3333-4444-555566667777"
        await bob.e2ee.addContactToGroup(issuer, "bob-token", second, danActor)
        await laptop.e2ee.consumePendingWelcomes(issuer, "laptop-token", danActor)
        const { phone, row, publish } = await approvedNotPublished(directory, self, rows)
        const claim = directory.claimKeyPackage.bind(directory)
        let landed = false
        vi.spyOn(directory, "claimKeyPackage").mockImplementation(async (...args) => {
            try {
                return await claim(...args)
            } finally {
                // The upload lands between the first group's claim and the second's.
                if (!landed && args[3] === row.deviceId) {
                    landed = true
                    await publish()
                }
            }
        })
        const syncBoth = () => syncOwnGroupsUseCase(issuer, "laptop-token", danActor, [conversationId, second], deps)

        expect(await syncBoth()).toEqual({ added: 1, removed: 0, unclaimed: [row.deviceId], failed: [] })
        expect(await syncBoth()).toEqual({ added: 1, removed: 0, unclaimed: [], failed: [] })
        expect(await syncBoth()).toEqual({ added: 0, removed: 0, unclaimed: [], failed: [] })

        expect(await phone.e2ee.consumePendingWelcomes(issuer, "phone-token", danActor)).toEqual({ joined: 2 })
        for (const id of [conversationId, second]) {
            const sent = await phone.e2ee.encryptOutbound(id, text(`in ${id}`))
            const got = await bob.e2ee.decryptInbound(id, sent, { idpUrl: issuer, accessToken: "bob-token" })
            expect((got?.body as TextBody).text).toBe(`in ${id}`)
        }
    })

    it("commits out a leaf of its account whose root key the list doesn't show for its device", async () => {
        const { directory, bob, laptop, self, rows, sync } = await danAccount()
        const phone = await registered(directory, "phone-token", danActor)
        const phoneRow = await asListed(phone, danActor)
        rows.push(listedDevice(phoneRow, [approvedBy(self, phoneRow)]))
        // The instance attests a root key of its own under the approved phone's id.
        const rogue = testDevice(issuers, danActor, phoneRow.deviceId)
        await commitUnchecked(directory, bob, "bob-token", (await bob.mls.addMember(conversationId, await packageOf(rogue))).commit)
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)
        const heard = untrustedLeavesOf(laptop)

        const outcome = await sync()

        expect(outcome.removed).toBe(1)
        expect(heard).toMatchObject([{ conversationId, deviceId: phoneRow.deviceId, reason: "not-listed" }])
        expect(await leavesOf(laptop)).not.toContainEqual([phoneRow.deviceId, bytesToBase64(rogue.rootKey.publicKey)])
        await phone.e2ee.consumePendingWelcomes(issuer, "phone-token", danActor)
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)
        expect(await read(bob, "bob-token", await phone.e2ee.encryptOutbound(conversationId, text("the real one")))).toBe("the real one")
        expect(untrustedLeavesOf(laptop)).toEqual([])
    })

    it("commits out a leaf of its account listed but never approved", async () => {
        const { directory, bob, laptop, rows, sync } = await danAccount()
        const tablet = await registered(directory, "tablet-token", danActor)
        const tabletRow = await asListed(tablet, danActor)
        rows.push(listedDevice(tabletRow))
        const claimed = await directory.claimKeyPackage(issuer, "bob-token", danActor, tabletRow.deviceId)
        await commitUnchecked(directory, bob, "bob-token", (await bob.mls.addMember(conversationId, claimed.key_package)).commit)
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)
        const heard = untrustedLeavesOf(laptop)

        expect(await sync()).toEqual({ added: 0, removed: 1, unclaimed: [], failed: [] })

        expect(heard).toMatchObject([{ deviceId: tabletRow.deviceId, reason: "not-approved" }])
        expect((await leavesOf(laptop)).map(([device]) => device)).not.toContain(tabletRow.deviceId)
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)
        expect(await read(laptop, "laptop-token", await bob.e2ee.encryptOutbound(conversationId, text("without it")))).toBe("without it")
    })

    it("checks a leaf again against the tree as it stands: the index it held went to an approved device", async () => {
        const { directory, bob, laptop, self, rows } = await danAccount()
        const phone = await registered(directory, "phone-token", danActor)
        const phoneRow = await asListed(phone, danActor)
        rows.push(listedDevice(phoneRow, [approvedBy(self, phoneRow)]))
        const rogue = testDevice(issuers, danActor, phoneRow.deviceId)
        await commitUnchecked(directory, bob, "bob-token", (await bob.mls.addMember(conversationId, await packageOf(rogue))).commit)
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)
        const trust = await laptop.e2ee.reviewDevices(issuer, "laptop-token", danActor, rows)
        // Meanwhile Bob takes the rogue leaf out and adds the real phone, which lands at its index.
        const rogueIndex = (await bob.mls.groupLeaves(conversationId)).find((leaf) => leaf.credential?.drk_pub === bytesToBase64(rogue.rootKey.publicKey))!.leafIndex
        await commitUnchecked(directory, bob, "bob-token", await bob.mls.removeMember(conversationId, rogueIndex))
        const claimed = await directory.claimKeyPackage(issuer, "bob-token", danActor, phoneRow.deviceId)
        const add = await bob.mls.addMember(conversationId, claimed.key_package)
        await commitUnchecked(directory, bob, "bob-token", add.commit)
        await directory.postWelcome(issuer, "bob-token", {
            recipient_actor_uri: danActor,
            recipient_device_id: phoneRow.deviceId,
            conversation_id: conversationId,
            welcome_blob: add.welcome,
        })
        const phoneIndex = (await bob.mls.groupLeaves(conversationId)).find((leaf) => leaf.credential?.device_id === phoneRow.deviceId)!.leafIndex
        expect(phoneIndex).toBe(rogueIndex)
        const posted = vi.spyOn(directory, "postCommit")

        expect(await laptop.e2ee.removeUntrustedLeaves(issuer, "laptop-token", conversationId, trust)).toEqual({ removed: 0 })
        // The commit built on its stale tree lost its epoch; caught up, the leaf there was the phone's.
        expect(posted).toHaveBeenCalledOnce()
        await expect(posted.mock.results[0].value).rejects.toMatchObject({ status: 409 })

        await phone.e2ee.consumePendingWelcomes(issuer, "phone-token", danActor)
        expect(await read(phone, "phone-token", await laptop.e2ee.encryptOutbound(conversationId, text("still in")))).toBe("still in")
        expect(untrustedLeavesOf(laptop)).toEqual([])
    })

    it("commits a contact's forged leaf out, keeping its record until a commit the instance carries", async () => {
        const { directory, bob, laptop } = await danAccount({ holding: false })
        const eve = await registered(directory, "eve-token", eveActor)
        await bobAdds(directory, bob, await forgedPackage(eve))
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)
        directory.failNextCommit = true

        await expect(laptop.e2ee.removeUntrustedLeaves(issuer, "laptop-token", conversationId, null)).rejects.toThrow("connection reset")
        expect(untrustedLeavesOf(laptop)).toMatchObject([{ actorUri: eveActor, reason: "binding" }])

        expect(await laptop.e2ee.removeUntrustedLeaves(issuer, "laptop-token", conversationId, null)).toEqual({ removed: 1 })
        expect(untrustedLeavesOf(laptop)).toEqual([])
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)
        expect(await bob.mls.groupLeaves(conversationId)).toHaveLength(2)
        expect(await read(bob, "bob-token", await laptop.e2ee.encryptOutbound(conversationId, text("out")))).toBe("out")
    })

    it("prunes, at a member's removal, a leaf naming a member of the roster that its checks show forged", async () => {
        const { directory, bob, laptop } = await danAccount({ holding: false })
        // Dan's own credential over a leaf key Dan's root key never bound.
        await bobAdds(directory, bob, await forgedPackage(laptop))

        expect(await bob.e2ee.pruneGroup(issuer, "bob-token", conversationId, [bobActor, danActor])).toEqual({ removed: 1 })

        expect((await bob.mls.groupLeaves(conversationId)).map((leaf) => leaf.credential?.actor_uri)).toEqual([bobActor, danActor])
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)
        expect(await read(laptop, "laptop-token", await bob.e2ee.encryptOutbound(conversationId, text("pruned")))).toBe("pruned")
    })

    it("leaves a leaf whose attestation only expired in place, warned of, and a member's removal keeps it", async () => {
        const { directory, bob, laptop, sync } = await danAccount()
        const away = testDevice(issuers, bobActor)
        const lapsed = { ...away, attestation: issuers.attest(bobActor, away.deviceId, away.rootKey.publicKey, "2020-01-01T00:00:00Z") }
        await bobAdds(directory, bob, await packageOf(lapsed))
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)

        expect(await sync()).toEqual({ added: 0, removed: 0, unclaimed: [], failed: [] })

        expect(untrustedLeavesOf(laptop)).toMatchObject([{ deviceId: away.deviceId, reason: "expired" }])
        expect((await leavesOf(laptop)).map(([device]) => device)).toContain(away.deviceId)
        expect(await bob.e2ee.pruneGroup(issuer, "bob-token", conversationId, [bobActor, danActor])).toEqual({ removed: 0 })
    })

    it("decides nothing on a sibling whose chain it can't settle, and trusts its leaf once it can", async () => {
        const { jwks, net } = switchableJwks()
        const { directory, bob, laptop, self, rows } = await danAccount({ jwks })
        const phone = await sibling(directory, "phone-token")
        rows.push(listedDevice(phone.row, [approvedBy(self, phone.row)]))
        net.up = false
        const claimed = await directory.claimKeyPackage(issuer, "bob-token", danActor, phone.row.deviceId)
        await bobAdds(directory, bob, claimed.key_package, phone.row.deviceId)
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)

        const offline = await laptop.e2ee.reviewDevices(issuer, "laptop-token", danActor, rows)
        expect(offline.unsettled).toContainEqual({ deviceId: phone.row.deviceId, rootKey: phone.row.rootKey.publicKey })
        // The leaf verifies now; the list it is judged on couldn't say.
        net.up = true
        expect(await laptop.e2ee.removeUntrustedLeaves(issuer, "laptop-token", conversationId, offline)).toEqual({ removed: 0 })
        expect(untrustedLeavesOf(laptop)).toEqual([])

        const online = await laptop.e2ee.reviewDevices(issuer, "laptop-token", danActor, rows)
        expect(online.approved).toContainEqual({ deviceId: phone.row.deviceId, rootKey: phone.row.rootKey.publicKey })
        expect(await laptop.e2ee.removeUntrustedLeaves(issuer, "laptop-token", conversationId, online)).toEqual({ removed: 0 })
        await phone.ctx.e2ee.consumePendingWelcomes(issuer, "phone-token", danActor)
        expect(await read(phone.ctx, "phone-token", await laptop.e2ee.encryptOutbound(conversationId, text("in")))).toBe("in")
    })

    it("reads the list again before committing out a sibling a stale list showed unapproved", async () => {
        const { directory, bob, laptop, self, rows, listDevices, sync } = await danAccount()
        const phone = await sibling(directory, "phone-token")
        // Approved, then added by Bob, after this device's first read of the list.
        listDevices.mockResolvedValueOnce({ devices: [...rows, listedDevice(phone.row)] })
        rows.push(listedDevice(phone.row, [approvedBy(self, phone.row)]))
        const claimed = await directory.claimKeyPackage(issuer, "bob-token", danActor, phone.row.deviceId)
        await bobAdds(directory, bob, claimed.key_package, phone.row.deviceId)

        expect(await sync()).toEqual({ added: 0, removed: 0, unclaimed: [], failed: [] })

        expect(listDevices).toHaveBeenCalledTimes(2)
        expect(untrustedLeavesOf(laptop)).toEqual([])
        await phone.ctx.e2ee.consumePendingWelcomes(issuer, "phone-token", danActor)
        expect(await read(phone.ctx, "phone-token", await laptop.e2ee.encryptOutbound(conversationId, text("kept")))).toBe("kept")
    })

    it("acts on no verdict from a generation it no longer holds", async () => {
        const { directory, history, bob, laptop, self, rows } = await danAccount()
        const phone = await sibling(directory, "phone-token")
        rows.push(listedDevice(phone.row, [approvedBy(self, phone.row)]))
        const rogue = testDevice(issuers, danActor, phone.row.deviceId)
        await bobAdds(directory, bob, await packageOf(rogue))
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)
        const trust = await laptop.e2ee.reviewDevices(issuer, "laptop-token", danActor, rows)
        expect(trust).toMatchObject({ acting: true, generation: 1 })

        const elsewhere = new Uint8Array(32).fill(2)
        history.key = { generation: 2, salt: elsewhere.slice(0, 16), checkValue: elsewhere, approvalPublicKey: elsewhere, setByDevice: null }
        await laptop.e2ee.checkHistoryKey(issuer, "laptop-token")

        expect(await laptop.e2ee.addOwnDevices(issuer, "laptop-token", conversationId, trust)).toEqual({ added: 0, unclaimed: [] })
        expect(await laptop.e2ee.removeUntrustedLeaves(issuer, "laptop-token", conversationId, trust)).toEqual({ removed: 0 })
    })

    it("runs one sync at a time: the syncs asked meanwhile are one run after it, adding nobody twice", async () => {
        const { directory, laptop, self, rows, deps } = await danAccount()
        const phone = await sibling(directory, "phone-token")
        rows.push(listedDevice(phone.row, [approvedBy(self, phone.row)]))
        const sync = oneAtATime(syncOwnGroupsUseCase)
        const run = () => sync(issuer, "laptop-token", danActor, [conversationId], deps)

        const outcomes = await Promise.all([run(), run(), run()])

        expect(outcomes.map((o) => o.added)).toEqual([1, 0, 0])
        expect(deps.deviceDirectory.listDevices).toHaveBeenCalledTimes(2)
        expect(directory.welcomeRouting.filter((w) => w.recipient_device_id === phone.row.deviceId)).toHaveLength(1)
        await phone.ctx.e2ee.consumePendingWelcomes(issuer, "phone-token", danActor)
        expect(await read(laptop, "laptop-token", await phone.ctx.e2ee.encryptOutbound(conversationId, text("once")))).toBe("once")
    })

    it("keeps a revocation it made, after a reload, against a list showing the device unrevoked", async () => {
        const { directory, laptop, self, rows } = await danAccount()
        const phone = await sibling(directory, "phone-token")
        rows.push(listedDevice(phone.row, [approvedBy(self, phone.row)]))

        await laptop.e2ee.revokeDevice(issuer, "laptop-token", danActor, phone.row.deviceId, [conversationId])

        expect((await laptop.storage.loadDeviceTrust()).trust.revoked).toEqual([phone.row.deviceId])
        const reloaded = await reload(directory, laptop)
        const trust = await reloaded.e2ee.reviewDevices(issuer, "laptop-token", danActor, rows)
        expect(trust.acting).toBe(true)
        expect(trust.approved.map((d) => d.deviceId)).toEqual([self.deviceId])
    })

    it("doesn't build again, this page load, a commit-out the instance refused for good", async () => {
        const { directory, bob, laptop } = await danAccount({ holding: false })
        const eve = await registered(directory, "eve-token", eveActor)
        await bobAdds(directory, bob, await forgedPackage(eve))
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)
        const refused = vi.spyOn(directory, "postCommit").mockRejectedValue(new IdpError(403, "access_denied", "not a member"))

        await expect(laptop.e2ee.removeUntrustedLeaves(issuer, "laptop-token", conversationId, null)).rejects.toMatchObject({
            status: 403,
        })
        expect(await laptop.e2ee.removeUntrustedLeaves(issuer, "laptop-token", conversationId, null)).toEqual({ removed: 0 })

        expect(refused).toHaveBeenCalledOnce()
        expect(untrustedLeavesOf(laptop)).toMatchObject([{ actorUri: eveActor, reason: "binding" }])
    })

    it("commits a contact's forged leaf out after a reload lost its record", async () => {
        const { directory, bob, laptop } = await danAccount({ holding: false })
        const eve = await registered(directory, "eve-token", eveActor)
        await bobAdds(directory, bob, await forgedPackage(eve))
        await laptop.e2ee.catchUp(issuer, "laptop-token", conversationId)

        const reloaded = await reload(directory, laptop)
        expect(untrustedLeavesOf(reloaded)).toEqual([])

        expect(await reloaded.e2ee.removeUntrustedLeaves(issuer, "laptop-token", conversationId, null)).toEqual({ removed: 1 })
        await bob.e2ee.catchUp(issuer, "bob-token", conversationId)
        expect(await read(bob, "bob-token", await reloaded.e2ee.encryptOutbound(conversationId, text("clean")))).toBe("clean")
    })
})
