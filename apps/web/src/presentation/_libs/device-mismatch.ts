import {
    type SignInAgain,
    signInAgainOnDeviceMismatchUseCase,
} from "@pinai/domain/usecases/auth/sign-in-again.usecase"
import { getAuthPlatform, getAuthPort, getSessionRenewal } from "@/ioc/index"
import { useAppStore } from "@/store/store"

let signInAgain: SignInAgain | null = null

/** For a `catch`: a session naming another device than this one signs in afresh. Whether it does. */
export function signInAgainOnDeviceMismatch(error: unknown): Promise<boolean> {
    signInAgain ??= signInAgainOnDeviceMismatchUseCase(getAuthPort(), getAuthPlatform(), getSessionRenewal())
    const { idpUrl, clearSession } = useAppStore.getState()
    return signInAgain(error, idpUrl, clearSession)
}
