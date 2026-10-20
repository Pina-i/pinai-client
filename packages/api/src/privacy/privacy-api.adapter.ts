import { idp } from "../http"
import type { BlockedActorEntry, ContactPolicy } from "@pinai/domain/models/block"
import type { IPrivacyPort } from "@pinai/domain/ports/privacy.port"
import { idpErrorFrom } from "../idp-error"

export class PrivacyApiAdapter implements IPrivacyPort {
    async listBlocks(idpUrl: string, accessToken: string): Promise<BlockedActorEntry[]> {
        try {
            return await idp
                .get(`${idpUrl.replace(/\/$/, "")}/api/blocks`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                })
                .json<BlockedActorEntry[]>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to fetch blocked users")
        }
    }

    async block(idpUrl: string, accessToken: string, actorUri: string): Promise<void> {
        try {
            await idp.post(`${idpUrl.replace(/\/$/, "")}/api/blocks`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { actor_uri: actorUri },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Block failed")
        }
    }

    async unblock(idpUrl: string, accessToken: string, actorUri: string): Promise<void> {
        try {
            await idp.delete(`${idpUrl.replace(/\/$/, "")}/api/blocks/${encodeURIComponent(actorUri)}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
        } catch (error) {
            throw await idpErrorFrom(error, "Unblock failed")
        }
    }

    async setContactPolicy(idpUrl: string, accessToken: string, policy: ContactPolicy): Promise<ContactPolicy> {
        try {
            const saved = await idp
                .patch(`${idpUrl.replace(/\/$/, "")}/api/privacy`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    json: { contact_policy: policy },
                })
                .json<{ contact_policy: ContactPolicy }>()
            return saved.contact_policy
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to save the contact setting")
        }
    }
}
