import type { ContactPolicy } from "../../models/block"
import type { IPrivacyPort } from "../../ports/privacy.port"

export async function setContactPolicyUseCase(
    idpUrl: string,
    accessToken: string,
    policy: ContactPolicy,
    port: IPrivacyPort,
): Promise<ContactPolicy> {
    return port.setContactPolicy(idpUrl, accessToken, policy)
}
