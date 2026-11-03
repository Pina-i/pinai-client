import {
    signInAgainOnDeviceMismatchUseCase,
    signInAgainUseCase,
} from "@pinai/domain/usecases/auth/sign-in-again.usecase"
import { getAuthPlatform, getAuthPort } from "@/ioc/index"
import { useAppStore } from "@/store/store"

/** For a `catch`: a session naming another device than this one signs in afresh. Whether it does. */
export function signInAgainOnDeviceMismatch(error: unknown): Promise<boolean> {
    const { idpUrl, clearSession } = useAppStore.getState()
    return signInAgainOnDeviceMismatchUseCase(error, idpUrl, clearSession, getAuthPort(), getAuthPlatform())
}

/** The landing's `beforeLoad`: the sign-in a device mismatch asked for, once the IdP's logout is back. */
export function signInAgainAfterLogout(): Promise<boolean> {
    // An IdP out of reach leaves the landing, to sign in by hand.
    return signInAgainUseCase(getAuthPort(), getAuthPlatform()).catch(() => false)
}
