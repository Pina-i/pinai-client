import { instanceAddress } from "@pinai/domain/models/instance"
import { needsRecentSignIn } from "@pinai/domain/models/idp-error"
import { startLoginUseCase } from "@pinai/domain/usecases/auth/startLogin.usecase"
import { useCallback, useState } from "react"
import { getAuthPlatform, getAuthPort } from "@/ioc"
import { useAppStore } from "@/store/store"

/**
 * A sensitive action refused for a password typed too long ago: the IdP's page in the system's sheet asks it again, and
 * the app comes back to `returnTo`, signed in — the user then presses again, nothing is replayed.
 */
export function useRecentSignIn(returnTo: () => string) {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const [asking, setAsking] = useState<string | null>(null)
    const [leaving, setLeaving] = useState(false)
    const [failed, setFailed] = useState<string | null>(null)

    const refused = useCallback((error: unknown, action: string) => {
        if (!needsRecentSignIn(error)) return false
        setAsking(action)
        return true
    }, [])

    const signInAgain = () => {
        if (!idpUrl) return
        setLeaving(true)
        setFailed(null)
        startLoginUseCase(idpUrl, getAuthPort(), getAuthPlatform(), { reauthenticate: true, returnTo: returnTo() }).catch((error: unknown) => {
            setLeaving(false)
            setFailed(error instanceof Error && error.message ? error.message : "Couldn't reach your instance. Try again.")
        })
    }

    return {
        /** What the password is asked again for, as "start over"; `null` until it is. */
        asking,
        host: (idpUrl && instanceAddress(idpUrl)?.host) ?? "your instance",
        refused,
        ask: (action: string) => setAsking(action),
        dismiss: () => {
            setAsking(null)
            setFailed(null)
        },
        signInAgain,
        leaving,
        failed,
    }
}

export type RecentSignIn = ReturnType<typeof useRecentSignIn>
