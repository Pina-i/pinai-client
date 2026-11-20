import type { AuthSession } from "../../models/auth"
import { isUnreachable } from "../../models/idp-error"
import type { IAuthPort } from "../../ports/auth.port"
import type { Renewal } from "./renew-session.usecase"

export type ResumeOutcome =
    | { kind: "resumed"; session: AuthSession }
    /** None was kept, or the IdP ended it: signing in again is the only way back. */
    | { kind: "ended" }
    /** The IdP couldn't be reached, for the renewal or the account: the token is kept, to try again. */
    | { kind: "unreachable" }

/**
 * Picks up the session a platform kept across restarts — the desktop and the mobile app keep
 * their refresh token in the OS keychain: a renewal, then the account it belongs to. On the web,
 * where the token lives in the page, none is kept after a load.
 */
export async function resumeSessionUseCase(
    idpUrl: string,
    renew: () => Promise<Renewal>,
    authPort: IAuthPort,
): Promise<ResumeOutcome> {
    const renewal = await renew()
    if (renewal.kind !== "renewed") return { kind: renewal.kind }
    try {
        const config = await authPort.discoverConfig(idpUrl)
        const user = await authPort.fetchUserInfo(config.userinfo_endpoint, renewal.accessToken)
        return { kind: "resumed", session: { accessToken: renewal.accessToken, user, idpUrl } }
    } catch (error) {
        if (isUnreachable(error)) return { kind: "unreachable" }
        throw error
    }
}
