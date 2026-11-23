/** The engines a scenario plays with, and the credentials they carry. */

import type { LeafCredential } from "@pinai/domain/models/leaf-trust"
import { asActorUri } from "@pinai/domain/models/identity"
import type { IHpkePort } from "@pinai/domain/ports/hpke.port"
import type { IMlsEngine } from "@pinai/domain/ports/mls-engine.port"

export type ContractEngine = IMlsEngine & IHpkePort

/** A fresh engine, initialized, bound to no identity. */
export type MakeEngine = () => Promise<ContractEngine>

export const ALICE = "https://idp.example.com/users/alice"
export const BOB = "https://idp.example.com/users/bob"
export const CAROL = "https://idp.example.com/users/carol"
export const MALLORY = "https://idp.example.com/users/mallory"

let devices = 0

/**
 * A credential the engine carries as bytes: the engine checks none of it — `@pinai/crypto` does —,
 * so its signatures are placeholders.
 */
export function testCredential(actor: string, deviceId: string = nextDeviceId()): LeafCredential {
    return {
        v: 2,
        actor_uri: asActorUri(actor),
        device_id: deviceId,
        drk_pub: "AA==",
        idp_att: { issuer: "https://idp.example.com", kid: "contract", expires_at: "2099-01-01T00:00:00Z", signature: "AA==" },
        leaf_binding: "AA==",
    }
}

function nextDeviceId(): string {
    devices += 1
    return `00000000-0000-4000-8000-${devices.toString(16).padStart(12, "0")}`
}

export interface Device {
    engine: ContractEngine
    credential: LeafCredential
    key: Uint8Array
}

/** An engine whose leaf key is bound to a credential of `actor`'s. */
export async function device(make: MakeEngine, actor: string): Promise<Device> {
    const engine = await make()
    const key = await engine.generateSignatureKey()
    const credential = testCredential(actor)
    await engine.setIdentity(credential, key)
    return { engine, credential, key }
}
