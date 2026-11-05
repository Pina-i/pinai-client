import { useCallback, useEffect, useState } from "react"

import { devicesFromBeforeUseCase, type DevicesFromBefore } from "@pinai/domain/usecases/e2ee/devices-from-before.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { copyPassphrase } from "@/presentation/_libs/copy-passphrase"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { useAppStore } from "@/store/store"

export interface NewWordsViewModel {
    onCopy: () => void
    onContinue: () => void
    /** The devices these words left behind, as Settings → Devices seats them; `null` for none. */
    fromBefore: DevicesFromBefore | null
}

/** Continue is the user going past the words: they aren't shown again after a reload. */
export function useNewWordsViewModel(words: string[], onContinue: () => void): NewWordsViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const [fromBefore, setFromBefore] = useState<DevicesFromBefore | null>(null)

    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken || !actorUri) return
        let live = true
        void Promise.resolve()
            .then(() =>
                devicesFromBeforeUseCase({ e2eePort: getE2eePort(), deviceDirectoryPort: getDeviceDirectoryPort() })(idpUrl, accessToken, actorUri),
            )
            .then(
                (left) => {
                    if (live) setFromBefore(left)
                },
                (e: unknown) => warnE2ee("reading the devices the new words left behind", e),
            )
        return () => {
            live = false
        }
    }, [idpUrl, signedIn, actorUri, words])

    const onCopy = useCallback(() => copyPassphrase(words), [words])
    const goOn = useCallback(() => {
        void getE2eePort()
            .dismissNewWords()
            .catch((e: unknown) => warnE2ee("forgetting the new words were to be shown", e))
            .finally(onContinue)
    }, [onContinue])
    return { onCopy, onContinue: goOn, fromBefore }
}
