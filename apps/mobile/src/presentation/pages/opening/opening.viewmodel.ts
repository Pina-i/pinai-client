import { instanceAddress } from "@pinai/domain/models/instance"
import { prepareLoginUseCase } from "@pinai/domain/usecases/auth/startLogin.usecase"
import { rememberChosenInstanceUseCase } from "@pinai/domain/usecases/instance/last-instance.usecase"
import { router } from "expo-router"
import { useEffect, useState } from "react"
import { getAuthNavigation, getAuthPlatform, getAuthPort, getLastInstancePort } from "@/ioc"

/**
 * The hand-off: the sign-in prepared while the bar fills, then the IdP's pages in the system's
 * sheet. Closing them goes back to the server sheet, silently; their answer goes to the callback.
 */
export function useOpeningViewModel(origin: string) {
    const address = instanceAddress(origin)
    const [url, setUrl] = useState<string | null>(null)
    const [barDone, setBarDone] = useState(false)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        if (!address) return
        let current = true
        rememberChosenInstanceUseCase(address, getLastInstancePort())
        prepareLoginUseCase(address.origin, getAuthPort(), getAuthPlatform(), { returnTo: "/home" })
            .then((prepared) => current && setUrl(prepared))
            .catch(() => current && setFailed(true))
        return () => {
            current = false
        }
        // Once per instance opened.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [origin])

    useEffect(() => {
        if (!url || !barDone) return
        void getAuthNavigation()
            .openSignIn(url)
            .then((back) =>
                back.kind === "returned" ? router.replace({ pathname: "/callback", params: back.params }) : router.replace("/server"),
            )
    }, [url, barDone])

    return {
        host: address?.host ?? origin,
        failed: failed || !address,
        barDone: () => setBarDone(true),
        back: () => router.replace("/server"),
    }
}
