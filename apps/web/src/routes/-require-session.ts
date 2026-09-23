import { redirect } from "@tanstack/react-router"
import { isTokenValid } from "@pinai/domain/models/auth"
import { ensureAuthenticatedUseCase } from "@pinai/domain/usecases/auth/ensureAuthenticated.usecase"
import { openAccountStorageUseCase } from "@pinai/domain/usecases/e2ee/open-account-storage.usecase"
import { getAccountStoragePort, getAuthPlatform, getAuthPort } from "@/ioc/index"
import { useAppStore } from "@/store/store"

/**
 * `beforeLoad` for every route that needs a signed-in user. The account's
 * device storage is opened here rather than in a component, because the
 * authenticated layout's hooks read it the moment they mount.
 */
export async function requireSession(): Promise<void> {
    const { accessToken, idpUrl } = useAppStore.getState()
    try {
        await ensureAuthenticatedUseCase(isTokenValid(accessToken), idpUrl, getAuthPort(), getAuthPlatform())
    } catch {
        throw redirect({ to: "/" })
    }
    const user = useAppStore.getState().user
    if (user) {
        await openAccountStorageUseCase({ accountStoragePort: getAccountStoragePort() })(user.actor_uri)
    }
}
