import { isDeviceMismatch } from "../../models/idp-error"
import type { AuthPlatform, IAuthPort, ISessionTokenStore } from "../../ports/auth.port"
import type { Renewal } from "./renew-session.usecase"
import { startLoginUseCase } from "./startLogin.usecase"

export type SignInAgain = (error: unknown, idpUrl: string | null, clearSession: () => void) => Promise<boolean>

/** `device_mismatch`: the app ends its own session and signs in again, once a page. Whether it did. */
export function signInAgainOnDeviceMismatchUseCase(
    authPort: IAuthPort,
    platform: AuthPlatform,
    renew: () => Promise<Renewal>,
): SignInAgain {
    let running: Promise<boolean> | null = null
    return (error, idpUrl, clearSession) => {
        if (!isDeviceMismatch(error) || !idpUrl) return Promise.resolve(false)
        // The page is leaving: a second refusal meanwhile joins the first, which took the token.
        running ??= signInAgain(idpUrl, clearSession, authPort, platform, renew)
        return running
    }
}

async function signInAgain(
    idpUrl: string,
    clearSession: () => void,
    authPort: IAuthPort,
    platform: AuthPlatform,
    renew: () => Promise<Renewal>,
): Promise<boolean> {
    const held = platform.browserSession ? await heldToken(platform.tokens, renew) : null
    clearSession()
    // The desktop's token is revoked as it is cleared.
    platform.tokens.clear()
    try {
        if (held?.revocationEndpoint) {
            await authPort.revoke({
                revocationEndpoint: held.revocationEndpoint,
                clientId: held.clientId,
                refreshToken: held.refreshToken,
            })
        }
        await startLoginUseCase(idpUrl, authPort, platform)
    } catch {
        // Out of reach: the landing signs in again by hand.
        platform.navigation.navigateTo("/")
    }
    return true
}

/** The refresh token, once a renewal holding it has put back its successor. */
async function heldToken(tokens: ISessionTokenStore, renew: () => Promise<Renewal>) {
    const held = tokens.take()
    if (held) return held
    await renew()
    return tokens.take()
}
