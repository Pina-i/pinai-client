import { redirect } from "@tanstack/react-router"
import { isTokenValid } from "@pinai/domain/models/auth"
import { ensureAuthenticatedUseCase } from "@pinai/domain/usecases/auth/ensureAuthenticated.usecase"
import { resumeSessionUseCase } from "@pinai/domain/usecases/auth/resume-session.usecase"
import { openAccountStorageUseCase } from "@pinai/domain/usecases/e2ee/open-account-storage.usecase"
import { getAccountStoragePort, getAuthPlatform, getAuthPort, getSessionRenewal } from "@/ioc/index"
import { linkThisDevice } from "@/presentation/_libs/session-device"
import { keepSessionAlive } from "@/presentation/_libs/session-renewal"
import { useAppStore } from "@/store/store"

/**
 * `beforeLoad` for every route that needs a signed-in user. The account's
 * device storage is opened here rather than in a component, because the
 * authenticated layout's hooks read it the moment they mount; and the
 * session's renewal starts here, for every such route.
 */
export async function requireSession(): Promise<void> {
    await resumeKeptSession()
    const { accessToken, idpUrl } = useAppStore.getState()
    try {
        await ensureAuthenticatedUseCase(isTokenValid(accessToken), idpUrl, getAuthPort(), getAuthPlatform())
    } catch {
        throw redirect({ to: "/" })
    }
    const user = useAppStore.getState().user
    if (user) {
        await openAccountStorageUseCase({ accountStoragePort: getAccountStoragePort() })(user.actor_uri)
        linkThisDevice()
    }
    keepSessionAlive()
}

/**
 * A page load starts with no access token: a session the platform kept — the desktop's, in the
 * keychain — is picked up before anything else is tried. Nothing to pick up on the web.
 */
export async function resumeKeptSession(): Promise<void> {
    const { accessToken, idpUrl, setSession } = useAppStore.getState()
    if (accessToken !== null || !idpUrl) return
    const resumed = await resumeSessionUseCase(idpUrl, getSessionRenewal(), getAuthPort()).catch(() => null)
    if (resumed) setSession(resumed.accessToken, resumed.user, resumed.idpUrl)
}
