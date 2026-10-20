import type { AuthSession } from "../../models/auth"
import type { IAuthPort } from "../../ports/auth.port"
import type { Renewal } from "./renew-session.usecase"

/**
 * Picks up the session a platform kept across restarts — the desktop keeps its refresh token in
 * the OS keychain: a renewal, then the account it belongs to. `null` when none was kept, or the
 * IdP ended it; on the web, where the token lives in the page, there never is one after a load.
 */
export async function resumeSessionUseCase(
    idpUrl: string,
    renew: () => Promise<Renewal>,
    authPort: IAuthPort,
): Promise<AuthSession | null> {
    const renewal = await renew()
    if (renewal.kind !== "renewed") return null
    const config = await authPort.discoverConfig(idpUrl)
    const user = await authPort.fetchUserInfo(config.userinfo_endpoint, renewal.accessToken)
    return { accessToken: renewal.accessToken, user, idpUrl }
}
