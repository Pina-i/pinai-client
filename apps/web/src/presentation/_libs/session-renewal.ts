import { renewAfter } from "@pinai/domain/models/auth"
import { ensureAuthenticatedUseCase } from "@pinai/domain/usecases/auth/ensureAuthenticated.usecase"
import { getAuthPlatform, getAuthPort, getSessionRenewal, onAccessTokenRefused } from "@/ioc/index"
import { useAppStore } from "@/store/store"

// A timer stops while the device sleeps; a short tick against the wall clock catches up within seconds of waking.
const TICK_MS = 10_000
// Soon enough that a renewal whose answer was lost is tried again within the IdP's minute of grace.
const RETRY_MS = 15_000

let started = false
let scheduledFor: string | null = null
let dueAt = Number.POSITIVE_INFINITY
let ending = false

/**
 * Keeps the signed-in session going, from `requireSession`: the access token is renewed once
 * {@link renewAfter} says, on the page coming back to the foreground or online past that point,
 * and when the IdP refuses a request with it. Idempotent.
 */
export function keepSessionAlive(): void {
    if (!started) {
        started = true
        onAccessTokenRefused(renewAccessToken)
        window.setInterval(renewIfDue, TICK_MS)
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") renewIfDue()
        })
        window.addEventListener("online", renewIfDue)
    }
    const token = useAppStore.getState().accessToken
    if (token && token !== scheduledFor) schedule(token, renewAfter(token))
}

/**
 * Renews the session now. The new access token goes to the store; a session the IdP ended goes
 * through `/authorize` once — the login page, since the browser's session is the one that ended —
 * or, on the desktop, back to the landing. The new token, or `null`.
 */
export async function renewAccessToken(): Promise<string | null> {
    const signedIn = useAppStore.getState().user?.actor_uri
    if (!signedIn || ending) return null
    const renewal = await getSessionRenewal()()
    // Signed out, or in as someone else, while it ran: it answers nothing any more.
    const { user, idpUrl, setSession } = useAppStore.getState()
    if (user?.actor_uri !== signedIn || !idpUrl) return null
    switch (renewal.kind) {
        case "renewed":
            setSession(renewal.accessToken, user, idpUrl)
            schedule(renewal.accessToken, renewAfter(renewal.accessToken))
            return renewal.accessToken
        case "unreachable":
            dueAt = Date.now() + RETRY_MS
            return null
        case "ended":
            endSession(idpUrl)
            return null
    }
}

function schedule(token: string, delay: number | null): void {
    scheduledFor = token
    dueAt = delay === null ? Number.POSITIVE_INFINITY : Date.now() + delay
}

function renewIfDue(): void {
    if (Date.now() >= dueAt) void renewAccessToken()
}

function endSession(idpUrl: string): void {
    ending = true
    const platform = getAuthPlatform()
    platform.tokens.clear()
    useAppStore.getState().clearSession()
    ensureAuthenticatedUseCase(false, idpUrl, getAuthPort(), platform).catch(() =>
        platform.navigation.navigateTo("/"),
    )
}
