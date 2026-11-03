import { isDeviceMismatch } from "../../models/idp-error"
import type { AuthPlatform, IAuthPort } from "../../ports/auth.port"
import { logoutUseCase } from "./logout.usecase"
import { startLoginUseCase } from "./startLogin.usecase"

/**
 * A refusal naming another device than this one (`device_mismatch`): this device's storage was
 * wiped while its session lived, so the session still names the device it was. It signs out and in
 * again, and the new device registers from a session of its own (`identity-provider/specs/auth.md
 * § 1`, "Sessions and devices"). Whether it did.
 *
 * The web app's sign-in waits for the IdP's logout to come back ({@link signInAgainUseCase}):
 * signing in while the browser session lives would keep that very session. The desktop's opens an
 * app session of its own at once.
 */
export async function signInAgainOnDeviceMismatchUseCase(
    error: unknown,
    idpUrl: string | null,
    clearSession: () => void,
    authPort: IAuthPort,
    platform: AuthPlatform,
): Promise<boolean> {
    if (!isDeviceMismatch(error) || !idpUrl) return false
    if (platform.browserSession) {
        platform.session.set("sign_in_again", idpUrl)
        logoutUseCase(idpUrl, clearSession, platform)
        return true
    }
    clearSession()
    platform.tokens.clear()
    try {
        await startLoginUseCase(idpUrl, authPort, platform)
    } catch {
        // Out of reach: the landing signs in again by hand.
        platform.navigation.navigateTo("/")
    }
    return true
}

/** Where the IdP's logout comes back: the sign-in a device mismatch asked for. Whether one started. */
export async function signInAgainUseCase(authPort: IAuthPort, platform: AuthPlatform): Promise<boolean> {
    const idpUrl = platform.session.get("sign_in_again")
    if (!idpUrl) return false
    platform.session.remove("sign_in_again")
    await startLoginUseCase(idpUrl, authPort, platform)
    return true
}
