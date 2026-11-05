import { ed25519 } from "@noble/curves/ed25519.js"

import { bytesToBase64, decodeBase64 } from "@pinai/domain/lib/bytes"
import type { DeviceChainVerdict, DeviceListEntry, DeviceRootVerdict } from "@pinai/domain/models/device"
import type { CheckedApproval, CheckedDevice } from "@pinai/domain/models/device-trust"
import { instanceOrigin } from "@pinai/domain/models/identity"
import type { LeafClaim, LeafVerdict } from "@pinai/domain/models/leaf-trust"
import type { IJwksCachePort } from "@pinai/domain/ports/jwks-cache.port"

import { approvalBytes, attestationBytes, deviceHpkeKeyBytes, leafBindingBytes } from "./canonical-bytes"

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

/** Until when a check passed on an attestation expiring at `expiresAt` holds. */
export function attestedUntil(expiresAt: string): number {
    return Date.parse(expiresAt) + CLOCK_SKEW_MS
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

/** JWKS → attestation → root key for one listed device, unrevoked: what announcing and approving it rest on. */
export async function verifyDeviceRoot(actorUri: string, device: DeviceListEntry, jwks: IJwksCachePort): Promise<DeviceRootVerdict> {
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
    return { ok: true, deviceId: device.device_id, rootKey }
}

/** `identity-provider/specs/e2ee.md § 3.3` for one listed device, its HPKE key included; its approvals are another matter. */
export async function verifyDeviceChain(
    actorUri: string,
    device: DeviceListEntry,
    jwks: IJwksCachePort,
): Promise<DeviceChainVerdict> {
    const root = await verifyDeviceRoot(actorUri, device, jwks)
    if (!root.ok) return root
    const { hpke_public_key: hpkeKey, hpke_key_signature: hpkeSignature } = device
    if (!hpkeKey || !hpkeSignature) return { ok: false, reason: "no-hpke-key" }
    if (!verifyStrict(hpkeSignature, deviceHpkeKeyBytes(actorUri, device.device_id, hpkeKey), root.rootKey)) {
        return { ok: false, reason: "hpke-signature" }
    }
    return { ...root, hpkePublicKey: hpkeKey }
}

/** `signerKey` approved the device `deviceId` over `rootKey`: the `PINAI-DEVICE-APPROVAL-v1` bytes (§ 7.2). */
export function verifyApproval(
    signature: Uint8Array,
    actorUri: string,
    deviceId: string,
    rootKey: Uint8Array,
    signerKey: Uint8Array,
): boolean {
    return verifyStrict(signature, approvalBytes(actorUri, deviceId, rootKey), signerKey)
}

/** Root checks by the row's content, each until its attestation's expiry; an issuer out of reach is never kept. */
export type RootChecks = Map<string, { verdict: DeviceRootVerdict; until: number }>

async function verifyRootOnce(actorUri: string, device: DeviceListEntry, jwks: IJwksCachePort, cache: RootChecks | undefined) {
    if (!cache || device.revoked_at !== null) return verifyDeviceRoot(actorUri, device, jwks)
    const key = [
        actorUri,
        device.device_id,
        device.drk_public_key && bytesToBase64(device.drk_public_key),
        device.attestation_signature && bytesToBase64(device.attestation_signature),
        device.attestation_kid,
        device.attestation_expires_at,
    ].join("|")
    const held = cache.get(key)
    if (held && held.until > Date.now()) return held.verdict
    const verdict = await verifyDeviceRoot(actorUri, device, jwks)
    if (verdict.ok && device.attestation_expires_at) cache.set(key, { verdict, until: attestedUntil(device.attestation_expires_at) })
    else if (!verdict.ok && verdict.reason !== "unreachable") cache.set(key, { verdict, until: Infinity })
    return verdict
}

/**
 * Each listed device as this device checks it (`identity-provider/specs/e2ee.md § 3.9`): its root
 * key's chain, and each approval over its listed root key — by the passphrase under `approvalKey`,
 * the key this device derived itself and never the one the server lists; by a device under the
 * root key listed for it, carried along so the rule matches it by id and root key. Who is approved
 * is the domain's rule (`approvedDevicesBy`).
 */
export async function checkListedDevices(
    actorUri: string,
    devices: readonly DeviceListEntry[],
    approvalKey: Uint8Array,
    jwks: IJwksCachePort,
    rootChecks?: RootChecks,
): Promise<CheckedDevice[]> {
    const checked: CheckedDevice[] = []
    for (const device of devices) {
        const root = await verifyRootOnce(actorUri, device, jwks, rootChecks)
        const rootKey = device.drk_public_key
        const approvals = device.approvals.map((approval): CheckedApproval => {
            if (approval.by === "passphrase") {
                const verifies = rootKey !== null && verifyApproval(approval.signature, actorUri, device.device_id, rootKey, approvalKey)
                return { by: "passphrase", generation: approval.generation, verifies }
            }
            const signer = devices.find((d) => d.device_id === approval.device_id)?.drk_public_key ?? null
            const verifies =
                rootKey !== null && signer !== null && verifyApproval(approval.signature, actorUri, device.device_id, rootKey, signer)
            return { by: "device", approver: approval.device_id, approverRootKey: signer, verifies, createdAt: approval.created_at }
        })
        checked.push({
            deviceId: device.device_id,
            displayName: device.display_name,
            rootKey,
            revoked: device.revoked_at !== null,
            chain: root.ok ? "ok" : root.reason === "unreachable" || root.reason === "expired" ? "unsettled" : "failed",
            approvals,
        })
    }
    return checked
}
