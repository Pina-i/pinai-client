import { ed25519 } from "@noble/curves/ed25519.js"

import type { JwksCacheAdapter } from "@/adapters/jwks/jwks-cache.adapter"
import { base64ToBytes } from "@/presentation/_libs/utils-bytes"

const CLOCK_SKEW_MS = 5 * 60 * 1000 // 5 minutes

export type VerifyResult =
    | { ok: true; actorUri: string; deviceId: string }
    | { ok: false; reason: string }

interface LeafCredentialV1 {
    v: number
    actor_uri: string
    device_id: string
    drk_pub: string
    idp_att: {
        issuer: string
        kid: string
        expires_at: string
        signature: string
    }
}

function originOf(url: string): string | null {
    try {
        return new URL(url).origin
    } catch {
        return null
    }
}

/**
 * Verify the IdP→DRK chain on an MLS leaf credential. Checks issuer-origin
 * binding to actor_uri, expiry (5-min skew), and the IdP signature over
 * canonical bytes. Invalidates and retries once on verify-failure for JWKS
 * rotation safety. See `specs/05-e2ee.md` for the wire format.
 */
export async function verifyLeafCredential(
    credentialBytes: Uint8Array,
    jwks: JwksCacheAdapter,
): Promise<VerifyResult> {
    let cred: LeafCredentialV1
    try {
        cred = JSON.parse(new TextDecoder().decode(credentialBytes)) as LeafCredentialV1
    } catch {
        return { ok: false, reason: "credential JSON invalid" }
    }
    if (cred.v !== 1) return { ok: false, reason: "unsupported credential version" }

    const actorOrigin = originOf(cred.actor_uri)
    const issuerOrigin = originOf(cred.idp_att.issuer)
    if (!actorOrigin || !issuerOrigin || actorOrigin !== issuerOrigin) {
        return { ok: false, reason: "issuer origin mismatch" }
    }

    const expiresAt = Date.parse(cred.idp_att.expires_at)
    if (Number.isNaN(expiresAt) || expiresAt + CLOCK_SKEW_MS < Date.now()) {
        return { ok: false, reason: "attestation expired" }
    }

    // Canonical bytes — must match the server's canonical_attestation_bytes in
    // crates/e2ee/src/attestation.rs (golden-vector test there).
    const canonical = new TextEncoder().encode(
        `IDP-ATTEST-v1\n${cred.actor_uri}\n${cred.device_id}\n${cred.drk_pub}\n${cred.idp_att.expires_at}\n${cred.idp_att.kid}`,
    )
    const idpSig = base64ToBytes(cred.idp_att.signature)

    let idpKey = await jwks.getKey(cred.idp_att.issuer, cred.idp_att.kid)
    let idpOk = false
    if (idpKey) {
        try {
            idpOk = ed25519.verify(idpSig, canonical, idpKey)
        } catch {
            idpOk = false
        }
    }
    if (!idpOk) {
        // Rotation safety — drop the cache and retry once.
        jwks.invalidate(cred.idp_att.issuer)
        idpKey = await jwks.getKey(cred.idp_att.issuer, cred.idp_att.kid)
        if (idpKey) {
            try {
                idpOk = ed25519.verify(idpSig, canonical, idpKey)
            } catch {
                idpOk = false
            }
        }
    }
    if (!idpOk) return { ok: false, reason: "IdP attestation signature invalid" }

    return { ok: true, actorUri: cred.actor_uri, deviceId: cred.device_id }
}
