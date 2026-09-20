import type { ActorUri, ConversationId, DeviceId } from "../../models/e2ee"
import type { IE2eePort } from "../../ports/e2ee.port"

export interface RevokeDeviceDeps {
    e2eePort: IE2eePort
}

export interface RevokeDeviceInput {
    idpUrl: string
    accessToken: string
    /** The local user's actor URI — credentials encode it alongside `device_id`. */
    actorUri: ActorUri
    /** The device to evict. */
    deviceId: DeviceId
    /**
     * Every conversation we want the revocation to apply to. Caller
     * pulls this from the zustand store (`localDmConvos.map(c => c.id)`)
     * before invoking — the port stays free of state.
     */
    conversationIds: ConversationId[]
    /**
     * If `true`, also clear the wrapped MSK on the IdP. Use when the
     * revoked device was the only one with the Recovery Key
     * passphrase committed to memory (paranoid mode).
     */
    alsoClearRecovery?: boolean
}

/**
 * Settings → Devices → "Revoke other device". Builds + delivers an
 * MLS Remove commit per group the user is in, removing the targeted
 * leaf. Post-compromise security recovers within each commit cycle.
 *
 * Returns the list of conversations the device was actually removed
 * from (skipping groups we have no local state for, plus any per-
 * group commit failures the loop logged + swallowed).
 *
 * Phase 6's Devices UI will render the result + a per-conversation
 * outcome breakdown.
 */
export const revokeDeviceUseCase =
    ({ e2eePort }: RevokeDeviceDeps) =>
    async (input: RevokeDeviceInput): Promise<{ removed_from: ConversationId[] }> => {
        return e2eePort.revokeDevice(
            input.idpUrl,
            input.accessToken,
            input.actorUri,
            input.deviceId,
            input.conversationIds,
            { also_clear_recovery: input.alsoClearRecovery },
        )
    }
