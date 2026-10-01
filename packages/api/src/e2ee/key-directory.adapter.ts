/**
 * REST implementation of {@link IKeyDirectoryPort}.
 *
 * Wraps the eight `/api/keys/*` and three `/api/mls/*` endpoints from
 * `identity-provider/specs/05-e2ee.md`. Bytes-in / bytes-out — base64
 * is the wire format for every binary blob (matches the server's JSON
 * shape).
 */

import ky from "ky"
import { idpErrorFrom } from "../idp-error"

import type {
    ActorUri,
    ClaimedKeyPackage,
    ConversationId,
    DeviceId,
    IdentityPublicKeys,
    KeyPackageStatusResponse,
} from "@pinai/domain/models/e2ee"
import type {
    Argon2Params,
    CommitView,
    IdentityKeysResponse,
    IKeyDirectoryPort,
    RecoveryBlobResponse,
    RegisterDeviceResponse,
    WelcomeView,
} from "@pinai/domain/ports/key-directory.port"

export class KeyDirectoryApiAdapter implements IKeyDirectoryPort {
    /** Legacy — no-op since the server-side identity endpoint is gone. */
    async publishIdentity(
        _idpUrl: string,
        _accessToken: string,
        _keys: IdentityPublicKeys,
    ): Promise<void> {}

    async registerDevice(
        idpUrl: string,
        accessToken: string,
        deviceId: DeviceId,
        drkPublicKey: Uint8Array,
    ): Promise<RegisterDeviceResponse> {
        const url = `${trimSlash(idpUrl)}/api/keys/devices`
        const body = await guarded(() =>
            ky.post(url, {
                headers: authHeader(accessToken),
                json: { device_id: deviceId, drk_public_key: b64(drkPublicKey) },
            }).json<{
                signature: string
                kid: string
                issued_at: string
                expires_at: string
                signed_message: string
            }>(),
        )
        return {
            signature: unb64(body.signature),
            kid: body.kid,
            issued_at: body.issued_at,
            expires_at: body.expires_at,
            signed_message: unb64(body.signed_message),
        }
    }

    /** Legacy — returns null since peers verify per-device IdP attestation instead. */
    async getIdentity(
        _idpUrl: string,
        _accessToken: string,
        _actorUri: ActorUri,
    ): Promise<IdentityKeysResponse | null> {
        return null
    }

    async uploadKeyPackages(
        idpUrl: string,
        accessToken: string,
        deviceId: DeviceId,
        packages: { key_package: Uint8Array; expires_at: string }[],
    ): Promise<{ uploaded: number; available_after: number }> {
        const url = `${trimSlash(idpUrl)}/api/keys/packages`
        return guarded(() =>
            ky
                .post(url, {
                    headers: authHeader(accessToken),
                    json: {
                        device_id: deviceId,
                        packages: packages.map((p) => ({
                            key_package: b64(p.key_package),
                            expires_at: p.expires_at,
                        })),
                    },
                })
                .json<{ uploaded: number; available_after: number }>(),
        )
    }

    async claimKeyPackage(
        idpUrl: string,
        accessToken: string,
        actorUri: ActorUri,
        deviceId: DeviceId | null,
    ): Promise<ClaimedKeyPackage> {
        const url = `${trimSlash(idpUrl)}/api/keys/packages/claim`
        const body: Record<string, unknown> = { actor_uri: actorUri }
        if (deviceId) body.device_id = deviceId
        const json = await guarded(() =>
            ky
                .post(url, {
                    headers: authHeader(accessToken),
                    json: body,
                })
                .json<{
                    key_package: string
                    device_id: DeviceId
                    expires_at: string
                    remaining_count: number
                    needs_refill: boolean
                }>(),
        )
        return {
            key_package: unb64(json.key_package),
            device_id: json.device_id,
            expires_at: json.expires_at,
            remaining_count: json.remaining_count,
            needs_refill: json.needs_refill,
        }
    }

    async getKeyPackageStatus(
        idpUrl: string,
        accessToken: string,
    ): Promise<KeyPackageStatusResponse> {
        const url = `${trimSlash(idpUrl)}/api/keys/packages/status`
        return guarded(() =>
            ky.get(url, { headers: authHeader(accessToken) }).json<KeyPackageStatusResponse>(),
        )
    }

    async postCommit(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        epoch: number,
        commitBlob: Uint8Array,
    ): Promise<CommitView> {
        const url = `${trimSlash(idpUrl)}/api/mls/groups/${encodeURIComponent(
            conversationId,
        )}/commits`
        const json = await guarded(() =>
            ky
                .post(url, {
                    headers: authHeader(accessToken),
                    json: { epoch, commit_blob: b64(commitBlob) },
                })
                .json<RawCommitView>(),
        )
        return parseCommitView(json)
    }

    async getCommitsSince(
        idpUrl: string,
        accessToken: string,
        conversationId: ConversationId,
        sinceEpoch: number,
    ): Promise<{ commits: CommitView[]; has_more: boolean }> {
        const url = `${trimSlash(idpUrl)}/api/mls/groups/${encodeURIComponent(
            conversationId,
        )}/commits`
        const json = await guarded(() =>
            ky
                .get(url, {
                    headers: authHeader(accessToken),
                    searchParams: { since: sinceEpoch },
                })
                .json<{ commits: RawCommitView[]; has_more: boolean }>(),
        )
        return { commits: json.commits.map(parseCommitView), has_more: json.has_more }
    }

    async getWelcomes(
        idpUrl: string,
        accessToken: string,
        deviceId: DeviceId,
    ): Promise<WelcomeView[]> {
        const url = `${trimSlash(idpUrl)}/api/mls/welcomes`
        const json = await guarded(() =>
            ky
                .get(url, {
                    headers: authHeader(accessToken),
                    searchParams: { device_id: deviceId },
                })
                .json<{ welcomes: RawWelcomeView[] }>(),
        )
        return json.welcomes.map((w) => ({
            id: w.id,
            conversation_id: w.conversation_id,
            recipient_device_id: w.recipient_device_id,
            welcome_blob: unb64(w.welcome_blob),
            created_at: w.created_at,
        }))
    }

    async postWelcome(
        idpUrl: string,
        accessToken: string,
        body: {
            recipient_actor_uri: ActorUri
            recipient_device_id: DeviceId
            conversation_id: ConversationId
            welcome_blob: Uint8Array
        },
    ): Promise<{ id: string }> {
        const url = `${trimSlash(idpUrl)}/api/mls/welcomes`
        return guarded(() =>
            ky
                .post(url, {
                    headers: authHeader(accessToken),
                    json: {
                        recipient_actor_uri: body.recipient_actor_uri,
                        recipient_device_id: body.recipient_device_id,
                        conversation_id: body.conversation_id,
                        welcome_blob: b64(body.welcome_blob),
                    },
                })
                .json<{ id: string }>(),
        )
    }

    // Legacy — /api/keys/recovery is gone; the passphrase now derives the
    // History Archive Key. Methods stay on the interface for the
    // integration test stub.
    async putRecoveryBlob(
        _idpUrl: string,
        _accessToken: string,
        _body: { wrapped_msk: Uint8Array; salt: Uint8Array; argon2_params: Argon2Params },
    ): Promise<void> {}

    async getRecoveryBlob(
        _idpUrl: string,
        _accessToken: string,
    ): Promise<RecoveryBlobResponse | null> {
        return null
    }

    async deleteRecoveryBlob(_idpUrl: string, _accessToken: string): Promise<void> {}
}

interface RawCommitView {
    id: string
    conversation_id: ConversationId
    epoch: number
    proposer_actor_uri: ActorUri
    commit_blob: string
    created_at: string
}

interface RawWelcomeView {
    id: string
    conversation_id: ConversationId
    recipient_device_id: DeviceId
    welcome_blob: string
    created_at: string
}

function parseCommitView(c: RawCommitView): CommitView {
    return {
        id: c.id,
        conversation_id: c.conversation_id,
        epoch: c.epoch,
        proposer_actor_uri: c.proposer_actor_uri,
        commit_blob: unb64(c.commit_blob),
        created_at: c.created_at,
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function trimSlash(url: string): string {
    return url.replace(/\/$/, "")
}

function authHeader(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` }
}

function b64(bytes: Uint8Array): string {
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
}

function unb64(s: string): Uint8Array {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn()
    } catch (error) {
        throw await idpErrorFrom(error, "Key directory request failed")
    }
}

