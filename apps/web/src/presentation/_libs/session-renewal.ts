import { ensureAuthenticatedUseCase } from "@pinai/domain/usecases/auth/ensureAuthenticated.usecase"
import { SESSION_TICK_MS, SessionKeeper } from "@pinai/domain/usecases/auth/keep-session.usecase"
import { getAuthPlatform, getAuthPort, getSessionRenewal, onAccessTokenRefused } from "@/ioc/index"
import { useAppStore } from "@/store/store"

const keeper = new SessionKeeper({
    renew: () => getSessionRenewal()(),
    signedIn: () => {
        const { user, idpUrl } = useAppStore.getState()
        return idpUrl ? (user?.actor_uri ?? null) : null
    },
    renewed: (accessToken) => {
        const { user, idpUrl, setSession } = useAppStore.getState()
        if (user && idpUrl) setSession(accessToken, user, idpUrl)
    },
    ended: () => {
        const { idpUrl } = useAppStore.getState()
        if (idpUrl) endSession(idpUrl)
    },
})

let started = false

/**
 * Keeps the signed-in session going, from `requireSession`: the domain's {@link SessionKeeper}
 * over this page's triggers — its tick, the page back in the foreground or online, a request the
 * IdP refused. Idempotent.
 */
export function keepSessionAlive(): void {
    if (!started) {
        started = true
        onAccessTokenRefused(renewAccessToken)
        window.setInterval(() => keeper.renewIfDue(), SESSION_TICK_MS)
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") keeper.renewIfDue()
        })
        window.addEventListener("online", () => keeper.renewIfDue())
    }
    keeper.track(useAppStore.getState().accessToken)
}

/**
 * Renews the session now. The new access token goes to the store; a session the IdP ended goes
 * through `/authorize` once — the login page, since the browser's session is the one that ended —
 * or, on the desktop, back to the landing. The new token, or `null`.
 */
export function renewAccessToken(): Promise<string | null> {
    return keeper.renewNow()
}

/** When `token` reached this page, on its clock; `null` for a token it never scheduled. */
export function accessTokenArrivedAt(token: string | null): number | null {
    return keeper.arrivalOf(token)
}

function endSession(idpUrl: string): void {
    const platform = getAuthPlatform()
    platform.tokens.clear()
    useAppStore.getState().clearSession()
    ensureAuthenticatedUseCase(false, idpUrl, getAuthPort(), platform).catch(() =>
        platform.navigation.navigateTo("/"),
    )
}
