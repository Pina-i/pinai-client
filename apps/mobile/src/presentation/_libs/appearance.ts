import type { UserProfile } from "@pinai/domain/models/auth"
import { receiveAccountSettingsUseCase, syncAccountSettingsOnSignInUseCase } from "@pinai/domain/usecases/user-settings/sync-account-settings.usecase"
import { getAccountSettingsPort, getUserSettingsStore } from "@/ioc"
import { useAppStore } from "@/store/store"

let following = false

/** Each account signed in (or resumed) brings its palette, motif and mutes, settled with this phone's copy. Idempotent. */
export function followAccountAppearance(): void {
    if (following) return
    following = true
    useAppStore.subscribe((state, previous) => {
        const { user, idpUrl, accessToken } = state
        if (user && idpUrl && accessToken && user.actor_uri !== previous.user?.actor_uri) void adopt(idpUrl, accessToken, user)
    })
}

async function adopt(idpUrl: string, accessToken: string, user: UserProfile): Promise<void> {
    const settings = await syncAccountSettingsOnSignInUseCase(
        idpUrl,
        accessToken,
        user.settings,
        user.actor_uri,
        getAccountSettingsPort(),
        getUserSettingsStore()
    ).catch(() => null)
    if (settings && useAppStore.getState().user?.actor_uri === user.actor_uri) useAppStore.getState().setAccountSettings(settings)
}

/** Another session of the account changed its settings (`settings_updated`). */
export function receiveAccountSettings(remote: unknown): void {
    const actor = useAppStore.getState().user?.actor_uri
    if (!actor) return
    const settings = receiveAccountSettingsUseCase(remote, actor, getUserSettingsStore())
    if (settings) useAppStore.getState().setAccountSettings(settings)
}
