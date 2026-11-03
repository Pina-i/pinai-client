import { ed25519 } from "@noble/curves/ed25519.js"

import { attestationBytes, leafBindingBytes } from "@pinai/crypto/canonical-bytes"
import { bytesToBase64 } from "@pinai/domain/lib/bytes"
import { instanceOrigin } from "@pinai/domain/models/identity"
import type { ActorUri, DeviceId } from "@pinai/domain/models/e2ee"
import type { LeafCredential } from "@pinai/domain/models/leaf-trust"
import type { IJwksCachePort } from "@pinai/domain/ports/jwks-cache.port"
import type { RegisterDeviceResponse } from "@pinai/domain/ports/key-directory.port"

export const KID = "test-key-1"

/** RFC 3339 to the second, as the IdP writes an attestation's expiry. */
export function wholeSeconds(at: Date): string {
    return at.toISOString().replace(/\.\d{3}Z$/, "Z")
}

export const IN_A_YEAR = () => wholeSeconds(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))

/** Each instance's attestation key, made on first use, and their JWKS as a device reads it. */
export class FakeIssuers {
    private readonly keys = new Map<string, { secretKey: Uint8Array; publicKey: Uint8Array }>()

    readonly jwks: IJwksCachePort = {
        getKey: async (issuer, kid) => (kid === KID ? this.key(issuer).publicKey : null),
        invalidate: () => undefined,
    }

    key(issuer: string): { secretKey: Uint8Array; publicKey: Uint8Array } {
        let key = this.keys.get(issuer)
        if (!key) {
            key = ed25519.keygen()
            this.keys.set(issuer, key)
        }
        return key
    }

    /** What `POST /api/keys/devices` answers: the actor's instance attesting the root key. */
    attest(actorUri: string, deviceId: DeviceId, rootKey: Uint8Array, expiresAt = IN_A_YEAR()): RegisterDeviceResponse {
        const signed = attestationBytes(actorUri, deviceId, rootKey, expiresAt, KID)
        return {
            signature: ed25519.sign(signed, this.key(instanceOrigin(actorUri)!).secretKey),
            kid: KID,
            issued_at: wholeSeconds(new Date()),
            expires_at: expiresAt,
            signed_message: signed,
        }
    }
}

export interface TestDevice {
    actorUri: ActorUri
    deviceId: DeviceId
    rootKey: { secretKey: Uint8Array; publicKey: Uint8Array }
    attestation: RegisterDeviceResponse
}

/** A device of `actorUri`: its root key, attested by its instance. */
export function testDevice(issuers: FakeIssuers, actorUri: ActorUri, deviceId: DeviceId = crypto.randomUUID()): TestDevice {
    const rootKey = ed25519.keygen()
    return { actorUri, deviceId, rootKey, attestation: issuers.attest(actorUri, deviceId, rootKey.publicKey) }
}

/** The credential the device's root key binds over `signatureKey`. */
export function credentialFor(device: TestDevice, signatureKey: Uint8Array): LeafCredential {
    const binding = ed25519.sign(leafBindingBytes(device.actorUri, device.deviceId, signatureKey), device.rootKey.secretKey)
    return {
        v: 2,
        actor_uri: device.actorUri,
        device_id: device.deviceId,
        drk_pub: bytesToBase64(device.rootKey.publicKey),
        idp_att: {
            issuer: instanceOrigin(device.actorUri)!,
            kid: device.attestation.kid,
            expires_at: device.attestation.expires_at,
            signature: bytesToBase64(device.attestation.signature),
        },
        leaf_binding: bytesToBase64(binding),
    }
}
