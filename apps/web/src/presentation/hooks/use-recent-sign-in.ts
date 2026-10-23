import { useCallback, useState } from "react"
import { toast } from "sonner"

import { needsRecentSignIn } from "@pinai/domain/models/idp-error"
import { startLoginUseCase } from "@pinai/domain/usecases/auth/startLogin.usecase"
import { getAuthPlatform, getAuthPort } from "@/ioc/index"
import { useAppStore } from "@/store/store"

export interface RecentSignIn {
    /** What the IdP asked the password again for, as "revoke a device"; null until it does. */
    asking: string | null
    /** The instance whose login page it is. */
    host: string
    /** True when `error` is the IdP asking for the password again before `action`. */
    refused: (error: unknown, action: string) => boolean
    dismiss: () => void
    /** The IdP's login page; back to `returnTo` once signed in, or on a cancel, still signed in. */
    signInAgain: () => void
    isLeaving: boolean
}

/** A sensitive action refused for a password typed too long ago: the user signs in again, then retries. */
export function useRecentSignIn(returnTo: () => string): RecentSignIn {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const [asking, setAsking] = useState<string | null>(null)
    const [isLeaving, setIsLeaving] = useState(false)

    const refused = useCallback((error: unknown, action: string) => {
        if (!needsRecentSignIn(error)) return false
        setAsking(action)
        return true
    }, [])

    const signInAgain = useCallback(() => {
        if (!idpUrl) return
        setIsLeaving(true)
        startLoginUseCase(idpUrl, getAuthPort(), getAuthPlatform(), { reauthenticate: true, returnTo: returnTo() }).catch(
            (e: unknown) => {
                setIsLeaving(false)
                toast.error(e instanceof Error ? e.message : "Could not reach your instance")
            },
        )
    }, [idpUrl, returnTo])

    return {
        asking,
        host: idpUrl ? new URL(idpUrl).host : "",
        refused,
        dismiss: useCallback(() => setAsking(null), []),
        signInAgain,
        isLeaving,
    }
}
