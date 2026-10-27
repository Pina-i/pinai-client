import { IdpError } from "../../models/idp-error"
import type { IInstanceAdminPort } from "../../ports/instance-admin.port"

/**
 * Revokes an open invitation. `gone` when the IdP no longer has it open — used, expired or revoked
 * meanwhile, all a `404` — which leaves the admin where they wanted to be. Any other refusal rejects.
 */
export async function revokeInvitationUseCase(
    idpUrl: string,
    accessToken: string,
    invitationId: string,
    port: IInstanceAdminPort,
): Promise<"revoked" | "gone"> {
    try {
        await port.revokeInvitation(idpUrl, accessToken, invitationId)
        return "revoked"
    } catch (e) {
        if (e instanceof IdpError && e.status === 404) return "gone"
        throw e
    }
}
