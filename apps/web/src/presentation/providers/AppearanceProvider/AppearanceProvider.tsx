import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import {
    resolveMode,
    sameAccountSettings,
    themeId,
    type AccountSettings,
    type AccountSettingsChange,
    type AppearanceSettings,
    type ModePreference,
    type ThemeFamily,
    type ThemeMode,
} from "@pinai/domain/models/user-settings"
import { loadUserSettingsUseCase } from "@pinai/domain/usecases/user-settings/load-user-settings.usecase"
import { pushAccountSettingsUseCase } from "@pinai/domain/usecases/user-settings/push-account-settings.usecase"
import {
    receiveAccountSettingsUseCase,
    syncAccountSettingsOnSignInUseCase,
} from "@pinai/domain/usecases/user-settings/sync-account-settings.usecase"
import { updateAccountSettingsUseCase } from "@pinai/domain/usecases/user-settings/update-account-settings.usecase"
import { updateDeviceSettingsUseCase } from "@pinai/domain/usecases/user-settings/update-device-settings.usecase"
import { setConversationMuted as muteConversation } from "@pinai/domain/models/mute"
import { getAccountSettingsPort, getUserSettingsStore } from "@/ioc"
import { useAppStore } from "@/store/store"
import { AppearanceContext } from "./AppearanceProvider.context"
import { NotificationSettingsContext } from "./NotificationSettings.context"

const DARK_QUERY = "(prefers-color-scheme: dark)"

/** The theme lives on <html>: `data-theme` picks the palette, the class picks the mode. */
function applyToDocument(family: ThemeFamily, mode: ThemeMode) {
    const root = document.documentElement
    root.dataset.theme = themeId(family, mode)
    root.classList.toggle("dark", mode === "dark")
    root.classList.toggle("light", mode === "light")
}

/**
 * Run a state update so the page cross-fades into its result. flushSync
 * commits it — and the layout effect that repaints <html> — before the view
 * transition takes its "new" snapshot. With reduced motion, or without the
 * API, the update just applies.
 */
function crossFade(update: () => void) {
    const commit = () => flushSync(update)
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (typeof document.startViewTransition === "function" && !reducedMotion) document.startViewTransition(commit)
    else commit()
}

/**
 * Owns the appearance: the palette and motif from the account settings, the
 * mode from this device's settings, and the OS preference `system` resolves
 * against. Applies the result to the document and saves every change.
 *
 * Owns the notification mutes too, as a second context: they are a section
 * of the same account document, which a single owner must hold so a change
 * to one section is never built on a stale copy of the other.
 *
 * Account settings follow the account: adopted from `/userinfo` on sign-in
 * (unless this device holds a change it couldn't send, which is sent
 * instead), sent to the IdP on every change, and received live from the
 * user's other sessions through `receiveAccountSettings`.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
    const [initial] = useState(() => loadUserSettingsUseCase(getUserSettingsStore()))
    const [account, setAccount] = useState<AccountSettings>(initial.account.settings)
    const [modePreference, setModePreferenceState] = useState<ModePreference>(initial.device.mode)
    const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia(DARK_QUERY).matches)

    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)

    const accountRef = useRef(account)
    const mode = resolveMode(modePreference, systemPrefersDark)
    const { family } = account.appearance

    // `index.html` already painted the stored theme; this keeps <html> in step with state.
    useLayoutEffect(() => {
        accountRef.current = account
    }, [account])
    useLayoutEffect(() => applyToDocument(family, mode), [family, mode])

    // `system` follows the OS live — a laptop switching at sunset switches the app with it.
    useEffect(() => {
        const query = window.matchMedia(DARK_QUERY)
        const onChange = (event: MediaQueryListEvent) => crossFade(() => setSystemPrefersDark(event.matches))
        query.addEventListener("change", onChange)
        return () => query.removeEventListener("change", onChange)
    }, [])

    const showAccountSettings = useCallback((next: AccountSettings | null) => {
        if (!next || sameAccountSettings(next, accountRef.current)) return
        const { family, motif } = accountRef.current.appearance
        const repaints = next.appearance.family !== family || next.appearance.motif !== motif
        // Set before the commit: a second change made before it lands must build on this one.
        accountRef.current = next
        if (repaints) crossFade(() => setAccount(next))
        else setAccount(next)
    }, [])

    // Every page load signs in again (tokens live in memory), so this runs once
    // per load, with the settings `/userinfo` just delivered.
    useEffect(() => {
        if (!accessToken || !idpUrl || !actorUri) return
        const remote = useAppStore.getState().user?.settings
        syncAccountSettingsOnSignInUseCase(idpUrl, accessToken, remote, actorUri, getAccountSettingsPort(), getUserSettingsStore())
            .then(showAccountSettings)
            // Unreachable IdP: keep painting this device's copy; an unsynced change retries next sign-in.
            .catch(() => {})
    }, [accessToken, idpUrl, actorUri, showAccountSettings])

    const updateAccount = useCallback(
        (change: AccountSettingsChange) => {
            // Account settings can only change while signed in.
            if (!actorUri) return
            const store = getUserSettingsStore()
            const next = updateAccountSettingsUseCase(accountRef.current, change, actorUri, store)
            showAccountSettings(next)
            if (accessToken && idpUrl) {
                pushAccountSettingsUseCase(idpUrl, accessToken, next, actorUri, getAccountSettingsPort(), store)
                    // Stays unsynced on this device and goes out again on the next sign-in.
                    .catch(() => {})
            }
        },
        [accessToken, idpUrl, actorUri, showAccountSettings],
    )

    const setAppearance = useCallback(
        (change: Partial<AppearanceSettings>) => {
            const current = accountRef.current.appearance
            if (Object.entries(change).every(([key, value]) => current[key as keyof AppearanceSettings] === value)) return
            updateAccount({ appearance: change })
        },
        [updateAccount],
    )

    const setConversationMuted = useCallback(
        (conversationId: string, muted: boolean) =>
            updateAccount({ notifications: muteConversation(accountRef.current.notifications, conversationId, muted) }),
        [updateAccount],
    )

    const setMuteAll = useCallback((muted: boolean) => updateAccount({ notifications: { muteAll: muted } }), [updateAccount])

    const receiveAccountSettings = useCallback(
        (remote: unknown) => {
            if (actorUri) showAccountSettings(receiveAccountSettingsUseCase(remote, actorUri, getUserSettingsStore()))
        },
        [actorUri, showAccountSettings],
    )

    const setModePreference = useCallback((preference: ModePreference) => {
        const { mode: saved } = updateDeviceSettingsUseCase({ mode: preference }, getUserSettingsStore())
        crossFade(() => setModePreferenceState(saved))
    }, [])

    const value = useMemo(
        () => ({
            appearance: account.appearance,
            modePreference,
            mode,
            setAppearance,
            setModePreference,
            receiveAccountSettings,
        }),
        [account.appearance, modePreference, mode, setAppearance, setModePreference, receiveAccountSettings],
    )

    const notificationSettings = useMemo(
        () => ({ notifications: account.notifications, setConversationMuted, setMuteAll }),
        [account.notifications, setConversationMuted, setMuteAll],
    )

    return (
        <AppearanceContext.Provider value={value}>
            <NotificationSettingsContext.Provider value={notificationSettings}>{children}</NotificationSettingsContext.Provider>
        </AppearanceContext.Provider>
    )
}
