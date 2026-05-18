/**
 * Domain models for end-to-end encryption (Phase 4+).
 *
 * The IdP server treats all of this as opaque bytes; these types only
 * exist so the client can talk about them without re-typing primitives
 * at every call site.
 */

/** Stable, opaque per-device UUID. Generated client-side at first login. */
export type DeviceId = string

/** Conversation UUID. Used as the MLS group ID. */
export type ConversationId = string

/**
 * Federation actor URI (e.g. `https://idp.alice.com/users/alice_xK9mP`).
 *
 * Branded so raw strings can't satisfy the type. The IdP's `/userinfo`
 * response is the canonical source for the local user; for peers, the
 * URI is already carried by API/WS payloads. When you do need to build
 * one client-side (an address from a route param, an arbitrary
 * webfinger-resolved handle), go through `addressToActorUri` in
 * `domain/models/identity.ts`. Trusted server-emitted strings (e.g.
 * the `actorUri` field on a conversation row) can be marked via
 * `asActorUri()` from the same module.
 */
export type ActorUri = string & { readonly __actorUri: unique symbol }

/**
 * 60-character base32 fingerprint over an MSK public key. UI shows it
 * in groups of 4 for out-of-band verification (Phase 6).
 */
export type Fingerprint = string

/**
 * The four user-controlled identity keys (see `specs/05-e2ee.md § 2`).
 * Public halves are uploaded to the IdP key directory; private halves
 * never leave the user's devices. The `*_signature` blobs prove that
 * `MSK` signed `SSK` and `USK` respectively.
 */
export interface IdentityPublicKeys {
    msk_public: Uint8Array
    ssk_public: Uint8Array
    ssk_signature: Uint8Array
    usk_public: Uint8Array
    usk_signature: Uint8Array
}

/**
 * Bundle held only on the user's device. Drops to disk encrypted at
 * rest by the storage adapter (Web Crypto wrapKey).
 */
export interface IdentityKeypair {
    msk_public: Uint8Array
    msk_private: Uint8Array
    ssk_public: Uint8Array
    ssk_private: Uint8Array
    ssk_signature: Uint8Array
    usk_public: Uint8Array
    usk_private: Uint8Array
    usk_signature: Uint8Array
}

/**
 * The MLS application-message envelope (`specs/05-e2ee.md § 6`).
 * `body` is `kind`-dependent — the client serialises it before
 * handing the bytes to the MLS layer for encryption.
 */
export type ApplicationKind = "text" | "reaction" | "edit" | "reply_meta" | "system"

export interface ApplicationMessage<TBody = unknown> {
    version: 1
    kind: ApplicationKind
    body: TBody
}

/**
 * Local archive envelope. Wraps an `ApplicationMessage` with the
 * metadata the restore path needs to reconstruct a UI `Message`:
 * sender, original timestamp, optional display name. Encrypted under
 * the History Archive Key before upload to `/api/history/messages`.
 *
 * Versioned so a future schema bump can be detected on restore — `v` is the
 * envelope version, independent of the inner `app.version`.
 */
export interface ArchiveEnvelope {
    v: 1
    sender_address: string
    sender_display_name?: string
    /** ISO-8601 — the server's persisted `created_at` for the original row. */
    created_at: string
    app: ApplicationMessage
}

export interface TextBody {
    text: string
    /** Decryption material for any encrypted attachments referenced by id. */
    attachments?: AttachmentBlobKey[]
    /**
     * When set, this message is a reply. The preview travels inside
     * the encrypted body so the server can't see it; only
     * `reply_to_id` (the parent UUID) is server-visible. Receiver
     * renders the inline preview via `Message.replyTo`.
     */
    reply_meta?: ReplyMetaBody
}

export interface ReactionBody {
    target_message_id: string
    emoji: string
    op: "add" | "remove"
}

export interface EditBody {
    target_message_id: string
    new_text: string
}

export interface ReplyMetaBody {
    target_message_id: string
    preview_text: string
    preview_sender: string
}

/**
 * Per-attachment AES-GCM key + nonce + plaintext metadata. Travels
 * inside the encrypted MLS body (`specs/05-e2ee.md § 7`).
 */
export interface AttachmentBlobKey {
    /** The IdP-side `message_attachments.id`. */
    id: string
    /** 32 bytes — never reused across attachments. */
    key: Uint8Array
    /** 12 bytes — fresh per attachment. */
    nonce: Uint8Array
    /** Real filename — server only ever sees `"encrypted"`. */
    original_filename: string
    /** Real MIME — server only ever sees `application/octet-stream`. */
    mime_type: string
    /** Plaintext byte size before AES-GCM tagging. */
    byte_size: number
}

/** Per-device count returned by `GET /api/keys/packages/status`. */
export interface KeyPackageDeviceStatus {
    device_id: DeviceId
    available: number
    needs_refill: boolean
}

/** Response shape of `GET /api/keys/packages/status`. */
export interface KeyPackageStatusResponse {
    devices: KeyPackageDeviceStatus[]
    refill_threshold: number
    cap: number
}

/** Response shape of `POST /api/keys/packages/claim`. */
export interface ClaimedKeyPackage {
    /** TLS-encoded MLS KeyPackage bytes. */
    key_package: Uint8Array
    /** The device the server actually claimed from. Use this as the
     *  Welcome's recipient_device_id so the bundle reaches the right
     *  leaf. */
    device_id: DeviceId
    expires_at: string
    remaining_count: number
    needs_refill: boolean
}
