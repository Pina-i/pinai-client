/**
 * Phase 5d.2 — full-loop integration test.
 *
 * Drives two `E2eeAdapter` instances (Alice + Bob) end-to-end against
 * an in-memory key directory and an in-memory storage backend. No
 * mocking of the MLS layer: this is the same WASM bundle the browser
 * runs.
 *
 * Flow under test:
 *   1. Alice + Bob register (identity publish + 50-KP stash each).
 *   2. Alice adds Bob to a fresh conversation (claim + commit + welcome).
 *   3. Bob consumes the pending welcome (joins the group).
 *   4. Alice sends a text → Bob decrypts.
 *   5. Bob sends a reaction → Alice decrypts.
 *   6. Alice edits the text → Bob decrypts.
 *   7. Alice attaches an encrypted file → Bob fetches + decrypts the
 *      ciphertext using the per-attachment key carried in the MLS body.
 */

import { beforeAll, describe, expect, it } from "vitest"

import { loadWasmModule } from "./setup/wasm"

import { decryptDownloaded, encryptForUpload } from "@pinai/crypto/attachment-crypto"
import { E2eeAdapter } from "@pinai/crypto/e2ee.adapter"
import { NobleIdentityAdapter } from "@pinai/crypto/identity.adapter"
import type {
    Argon2Params,
    CommitView,
    IdentityKeysResponse,
    IKeyDirectoryPort,
    RecoveryBlobResponse,
    WelcomeView,
} from "@pinai/domain/ports/key-directory.port"
import { MlsAdapter } from "@pinai/mls/wasm.adapter"
import { NobleRecoveryAdapter } from "@pinai/crypto/recovery.adapter"
import type { DeviceAttestation, E2eeStorage, MlsSnapshot } from "@pinai/crypto/sealed-storage"
import type { LocalFile } from "@pinai/domain/models/file"
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

class InMemoryKeyDirectory implements IKeyDirectoryPort {
    /**
     * Device attestation is the IdP's signing job and this suite never
     * exercises it. Throwing rather than returning a plausible-looking
     * attestation: a fake signature here would let a future test pass
     * while the verification path it is meant to cover is broken.
     */
    registerDevice(): Promise<never> {
        throw new Error("InMemoryKeyDirectory.registerDevice is not exercised by this suite")
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

    async putRecoveryBlob(
        _idpUrl: string,
        _accessToken: string,
        _body: { wrapped_msk: Uint8Array; salt: Uint8Array; argon2_params: Argon2Params },
    ): Promise<void> {
        // Recovery is exercised in a separate suite — this stub stays inert
        // so the integration test stays focused on the messaging loop.
    }
    async getRecoveryBlob(): Promise<RecoveryBlobResponse | null> {
        return null
    }
    async deleteRecoveryBlob(): Promise<void> {
        /* no-op */
    }
}

// ─── In-memory storage (one per adapter — distinct device ids) ───────

class InMemoryE2eeStorage implements E2eeStorage {
    private deviceId: DeviceId | null = null
    private keypair: IdentityKeypair | null = null
    private snapshot: MlsSnapshot | null = null
    private recoveryPassphrase: string[] | null = null
    private boundActorUri: ActorUri | null = null
    private deviceAttestation: DeviceAttestation | null = null

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
    async saveRecoveryPassphrase(words: string[]): Promise<void> {
        this.recoveryPassphrase = [...words]
    }
    async loadRecoveryPassphrase(): Promise<string[] | null> {
        return this.recoveryPassphrase
    }
    async clearRecoveryPassphrase(): Promise<void> {
        this.recoveryPassphrase = null
    }
    async saveDeviceAttestation(attestation: DeviceAttestation): Promise<void> {
        this.deviceAttestation = attestation
    }
    async loadDeviceAttestation(): Promise<DeviceAttestation | null> {
        return this.deviceAttestation
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
        this.recoveryPassphrase = null
        this.boundActorUri = null
    }
}

interface AdapterCtx {
    e2ee: E2eeAdapter
    mls: MlsAdapter
    storage: InMemoryE2eeStorage
}

async function buildAdapter(
    directory: InMemoryKeyDirectory,
    accessToken: string,
    actorUri: ActorUri,
): Promise<AdapterCtx> {
    const mls = new MlsAdapter()
    await mls.initialize({ module_or_path: wasmModule } as never)
    const storage = new InMemoryE2eeStorage()
    const identity = new NobleIdentityAdapter()
    const recovery = new NobleRecoveryAdapter()
    const e2ee = new E2eeAdapter(identity, mls, storage, directory, recovery)
    directory.bindToken(accessToken, actorUri)
    return { e2ee, mls, storage }
}

/** The same device after a page reload: a fresh engine over what it persisted. */
async function reload(directory: InMemoryKeyDirectory, ctx: AdapterCtx): Promise<AdapterCtx> {
    const mls = new MlsAdapter()
    await mls.initialize({ module_or_path: wasmModule } as never)
    const e2ee = new E2eeAdapter(new NobleIdentityAdapter(), mls, ctx.storage, directory, new NobleRecoveryAdapter())
    return { e2ee, mls, storage: ctx.storage }
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

    /** Bob and Dan's conversation, with Dan on one device; a second device of Dan's just signed in. */
    async function secondDevice() {
        const directory = new InMemoryKeyDirectory()
        directory.senderIssuer = issuer
        const bob = await buildAdapter(directory, "bob-token", bobActor)
        const dan1 = await buildAdapter(directory, "dan1-token", danActor)
        await bob.e2ee.register(issuer, "bob-token", bobActor)
        await dan1.e2ee.register(issuer, "dan1-token", danActor)
        await bob.e2ee.addContactToGroup(issuer, "bob-token", conversationId, danActor)
        await dan1.e2ee.consumePendingWelcomes(issuer, "dan1-token", danActor)
        const dan2 = await buildAdapter(directory, "dan2-token", danActor)
        await dan2.e2ee.register(issuer, "dan2-token", danActor)
        const ids = {
            dan1: await dan1.storage.getOrCreateDeviceId(),
            dan2: await dan2.storage.getOrCreateDeviceId(),
        }
        return { directory, bob, dan1, dan2, ids }
    }

    it("brings the new device in, reading and read from then on", async () => {
        const { bob, dan1, dan2, ids } = await secondDevice()

        const added = await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, [ids.dan2])
        await dan2.e2ee.consumePendingWelcomes(issuer, "dan2-token", danActor)

        expect(added).toEqual({ added: 1 })
        const fromDan2 = await dan2.e2ee.encryptOutbound(conversationId, text("from dan2"))
        expect(await read(bob, "bob-token", fromDan2)).toBe("from dan2")
        expect(await read(dan1, "dan1-token", fromDan2)).toBe("from dan2")
        const fromBob = await bob.e2ee.encryptOutbound(conversationId, text("from bob"))
        expect(await read(dan2, "dan2-token", fromBob)).toBe("from bob")
        expect(await read(dan1, "dan1-token", fromBob)).toBe("from bob")
        expect(await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, [ids.dan2])).toEqual({
            added: 0,
        })
    })

    it("founds no group on a device that holds none", async () => {
        const { directory, dan2, ids } = await secondDevice()
        const packages = directory.packagesOf(danActor)
        const commits = (await directory.getCommitsSince(issuer, "dan2-token", conversationId, 0)).commits.length

        const added = await dan2.e2ee.addOwnDevices(issuer, "dan2-token", conversationId, [ids.dan1])

        expect(added).toEqual({ added: 0 })
        expect(await dan2.mls.hasGroup(conversationId)).toBe(false)
        expect(directory.packagesOf(danActor)).toBe(packages)
        expect((await directory.getCommitsSince(issuer, "dan2-token", conversationId, 0)).commits).toHaveLength(
            commits,
        )
    })

    it("has the second of two devices adding a third at once catch up and find nothing left to do", async () => {
        const { directory, bob, dan1, dan2, ids } = await secondDevice()
        await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, [ids.dan2])
        await dan2.e2ee.consumePendingWelcomes(issuer, "dan2-token", danActor)
        const dan3 = await buildAdapter(directory, "dan3-token", danActor)
        await dan3.e2ee.register(issuer, "dan3-token", danActor)
        const dan3Id = await dan3.storage.getOrCreateDeviceId()

        const first = await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, [ids.dan2, dan3Id])
        const second = await dan2.e2ee.addOwnDevices(issuer, "dan2-token", conversationId, [ids.dan1, dan3Id])
        await dan3.e2ee.consumePendingWelcomes(issuer, "dan3-token", danActor)

        expect([first, second]).toEqual([{ added: 1 }, { added: 0 }])
        expect(await dan2.mls.getEpoch(conversationId)).toBe(await dan1.mls.getEpoch(conversationId))
        const fromDan3 = await dan3.e2ee.encryptOutbound(conversationId, text("from dan3"))
        expect(await read(bob, "bob-token", fromDan3)).toBe("from dan3")
        expect(await read(dan2, "dan2-token", fromDan3)).toBe("from dan3")
    })

    it("can add the device again after a commit lost on its way", async () => {
        const { directory, bob, dan1, dan2, ids } = await secondDevice()
        directory.failNextCommit = true

        await expect(
            dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, [ids.dan2]),
        ).rejects.toThrow("connection reset")

        expect(await dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, [ids.dan2])).toEqual({
            added: 1,
        })
        await dan2.e2ee.consumePendingWelcomes(issuer, "dan2-token", danActor)
        expect(await read(bob, "bob-token", await dan2.e2ee.encryptOutbound(conversationId, text("in"))))
            .toBe("in")
    })

    it("adds the device once when asked twice at once", async () => {
        const { directory, dan1, ids } = await secondDevice()

        const runs = await Promise.all([
            dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, [ids.dan2]),
            dan1.e2ee.addOwnDevices(issuer, "dan1-token", conversationId, [ids.dan2]),
        ])

        expect(runs.map((r) => r.added).sort()).toEqual([0, 1])
        expect(directory.welcomeRouting.filter((w) => w.recipient_device_id === ids.dan2)).toHaveLength(1)
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
