import { ed25519 } from "@noble/curves/ed25519.js"

import { decodeBase64 } from "@pinai/domain/lib/bytes"
import type { DeviceChainVerdict, DeviceListEntry } from "@pinai/domain/models/device"
import { instanceOrigin } from "@pinai/domain/models/identity"
import type { LeafClaim, LeafVerdict } from "@pinai/domain/models/leaf-trust"
import type { IJwksCachePort } from "@pinai/domain/ports/jwks-cache.port"

import { attestationBytes, deviceHpkeKeyBytes, leafBindingBytes } from "./canonical-bytes"

const CLOCK_SKEW_MS = 5 * 60 * 1000 // 5 minutes

/** Ed25519 as the IdP checks root keys: RFC 8032 strict, a small-order key refused. */
export function verifyStrict(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
    try {
        return ed25519.verify(signature, message, publicKey, { zip215: false })
    } catch {
        return false
    }
}

/** Both chains read an attestation's expiry alike: still ahead, 5 minutes of clock skew allowed. */
function stillAttested(expiresAt: string): "ok" | "expired" | "malformed" {
    const at = Date.parse(expiresAt)
    if (Number.isNaN(at)) return "malformed"
    return at + CLOCK_SKEW_MS < Date.now() ? "expired" : "ok"
}

/**
 * The issuer's key named by `kid` signed `message`; asked again after a fresh fetch when the cached
 * one doesn't verify, for a key the issuer rotated since.
 */
async function issuerSigned(
    jwks: IJwksCachePort,
    issuer: string,
    kid: string,
    message: Uint8Array,
    signature: Uint8Array,
): Promise<"ok" | "attestation" | "unreachable"> {
    try {
        const cached = await jwks.getKey(issuer, kid)
        if (cached && verifyStrict(signature, message, cached)) return "ok"
        jwks.invalidate(issuer)
        const fresh = await jwks.getKey(issuer, kid)
        return fresh && verifyStrict(signature, message, fresh) ? "ok" : "attestation"
    } catch {
        return "unreachable"
    }
}

/** `identity-provider/specs/e2ee.md § 3.4`, checks 1–5 in its order. */
export async function verifyLeafCredential(leaf: LeafClaim, jwks: IJwksCachePort): Promise<LeafVerdict> {
    const cred = leaf.credential
    if (!cred) return { ok: false, reason: "malformed" }

    // Exactly the actor's origin, which is where its keys are fetched from.
    const issuer = instanceOrigin(cred.actor_uri)
    if (!issuer || cred.idp_att.issuer !== issuer) return { ok: false, reason: "issuer-mismatch" }

    const expiry = stillAttested(cred.idp_att.expires_at)
    if (expiry !== "ok") return { ok: false, reason: expiry }

    const rootKey = decodeBase64(cred.drk_pub, 32)
    const attestation = decodeBase64(cred.idp_att.signature, 64)
    const binding = decodeBase64(cred.leaf_binding, 64)
    if (!rootKey || !attestation || !binding) return { ok: false, reason: "malformed" }

    const attested = await issuerSigned(
        jwks,
        issuer,
        cred.idp_att.kid,
        attestationBytes(cred.actor_uri, cred.device_id, rootKey, cred.idp_att.expires_at, cred.idp_att.kid),
        attestation,
    )
    if (attested !== "ok") return { ok: false, reason: attested }

    if (!verifyStrict(binding, leafBindingBytes(cred.actor_uri, cred.device_id, leaf.signatureKey), rootKey)) {
        return { ok: false, reason: "binding" }
    }
    return { ok: true, actorUri: cred.actor_uri, deviceId: cred.device_id, rootKey }
}

/** `identity-provider/specs/e2ee.md § 3.3` for one listed device; its approvals are another matter. */
export async function verifyDeviceChain(
    actorUri: string,
    device: DeviceListEntry,
    jwks: IJwksCachePort,
): Promise<DeviceChainVerdict> {
    if (device.revoked_at !== null) return { ok: false, reason: "revoked" }
    const { drk_public_key: rootKey, attestation_signature: signature } = device
    const { attestation_kid: kid, attestation_expires_at: expiresAt } = device
    const issuer = instanceOrigin(actorUri)
    if (!rootKey || !signature || !kid || !expiresAt || !issuer) return { ok: false, reason: "no-root-key" }

    if (stillAttested(expiresAt) !== "ok") return { ok: false, reason: "expired" }
    const attested = await issuerSigned(
        jwks,
        issuer,
        kid,
        attestationBytes(actorUri, device.device_id, rootKey, expiresAt, kid),
        signature,
    )
    if (attested !== "ok") return { ok: false, reason: attested }

    const { hpke_public_key: hpkeKey, hpke_key_signature: hpkeSignature } = device
    if (!hpkeKey || !hpkeSignature) return { ok: false, reason: "no-hpke-key" }
    if (!verifyStrict(hpkeSignature, deviceHpkeKeyBytes(actorUri, device.device_id, hpkeKey), rootKey)) {
        return { ok: false, reason: "hpke-signature" }
    }
    return { ok: true, deviceId: device.device_id, rootKey, hpkePublicKey: hpkeKey }
}
