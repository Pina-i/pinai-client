import { useEffect, useState } from "react"
import { Linking } from "react-native"
import { appVisibility } from "@/presentation/_libs/app-visibility"
import { askPushPermission, type PushPermission, pushAvailable, readPushPermission } from "@/presentation/_libs/push-notices"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"

/**
 * Whether Android lets the app send notices, read again whenever the app comes back to the front — its settings
 * may have changed it. `null` while unknown, and always in a build that can't be sent any.
 */
export function usePushPermission(): { permission: PushPermission | null; change: () => void } {
    const [permission, setPermission] = useState<PushPermission | null>(null)
    useEffect(() => {
        if (!pushAvailable) return
        let live = true
        const read = () =>
            void readPushPermission()
                .then((read) => live && setPermission(read))
                .catch((error: unknown) => warnE2ee("reading the notification permission", error))
        read()
        const stop = appVisibility.onChange(() => {
            if (appVisibility.visible()) read()
        })
        return () => {
            live = false
            stop()
        }
    }, [])
    // Android asks once: past that, only its settings turn notices on or off.
    const change = () => {
        if (permission === "undetermined") {
            askPushPermission()
                .then(setPermission)
                .catch((error: unknown) => warnE2ee("asking for the notification permission", error))
        } else {
            void Linking.openSettings()
        }
    }
    return { permission, change }
}
