import { retryUnauthorizedWith } from "@pinai/api/http"
import { SESSION_TICK_MS, SessionKeeper } from "@pinai/domain/usecases/auth/keep-session.usecase"
import { logoutUseCase } from "@pinai/domain/usecases/auth/logout.usecase"
import { type ResumeOutcome, resumeSessionUseCase } from "@pinai/domain/usecases/auth/resume-session.usecase"
import { router } from "expo-router"
import { AppState } from "react-native"
import { getAuthPlatform, getAuthPort, getSessionRenewal } from "@/ioc"
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
    // The token went with the refusal: back to Welcome, to sign in again.
    ended: () => {
        useAppStore.getState().clearSession()
        router.replace("/")
    },
})

let started = false

/** The domain's {@link SessionKeeper} over the app's triggers: its tick, back in front, a refused request. Idempotent. */
export function keepSessionAlive(): void {
    if (started) return
    started = true
    retryUnauthorizedWith(() => keeper.renewNow())
    setInterval(() => keeper.renewIfDue(), SESSION_TICK_MS)
    AppState.addEventListener("change", (state) => {
        if (state === "active") keeper.renewIfDue()
    })
    keeper.track(useAppStore.getState().accessToken)
    useAppStore.subscribe((state) => keeper.track(state.accessToken))
}

/**
 * At launch: the session the keychain kept, picked up. `null` when there was none to pick up;
 * `ended` has cleared it; `unreachable` keeps the token, for Retry.
 */
export async function resumeKeptSession(): Promise<ResumeOutcome | null> {
    const { accessToken, idpUrl, setSession, clearSession } = useAppStore.getState()
    if (accessToken !== null || !idpUrl) return null
    const outcome = await resumeSessionUseCase(idpUrl, getSessionRenewal(), getAuthPort()).catch(() => ({ kind: "unreachable" as const }))
    if (outcome.kind === "resumed") setSession(outcome.session.accessToken, outcome.session.user, outcome.session.idpUrl)
    if (outcome.kind === "ended") clearSession()
    return outcome
}

/** Signing out: the token revoked as its store clears it, then Welcome. */
export function signOut(): void {
    const { idpUrl, clearSession } = useAppStore.getState()
    if (idpUrl) logoutUseCase(idpUrl, clearSession, getAuthPlatform())
    else router.replace("/")
}
