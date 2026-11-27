import { oneAtATime } from "@pinai/domain/lib/one-at-a-time"
import Constants from "expo-constants"
import * as Notifications from "expo-notifications"
import { getE2eePort, getPushRegistrationPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { appVisibility } from "./app-visibility"
import { warnE2ee } from "./warn-e2ee"

/** The official app's relay: Expo's push service, which holds the app's FCM key (`identity-provider/specs/push.md`). */
const RELAY = "https://exp.host/--/api/v2/push/send"
/** The channel the instance's notices name. */
const CHANNEL = "sign-ins"

const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string }; pushNotices?: boolean } | undefined
const projectId = extra?.pushNotices ? extra.eas?.projectId : undefined

/** A build made without Firebase's file can't be sent notices: it neither asks nor registers. */
export const pushAvailable = projectId !== undefined

// In front, what a notice is about shows itself — the Door, the start over prompt —, so the notice stays unshown.
Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
})

let channel: Promise<unknown> | null = null

// Android asks for the permission, and mints a token, only once a channel exists.
function ensureChannel(): Promise<unknown> {
    channel ??= Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Sign-ins",
        description: "A device asks to sign in to your account, or to start your history over",
        importance: Notifications.AndroidImportance.HIGH,
    })
    return channel
}

/** `denied`: Android asks no more, only its settings turn notices on. */
export type PushPermission = "granted" | "undetermined" | "denied"

export async function readPushPermission(): Promise<PushPermission> {
    await ensureChannel()
    const { status, canAskAgain } = await Notifications.getPermissionsAsync()
    if (status === "granted") return "granted"
    return canAskAgain ? "undetermined" : "denied"
}

/** Android's prompt, then the registration as it answered. */
export async function askPushPermission(): Promise<PushPermission> {
    await ensureChannel()
    await Notifications.requestPermissionsAsync()
    syncNow()
    return readPushPermission()
}

// Whether this run registered this device: `null` until it decided, so a first refusal removes one left from before.
let registered: boolean | null = null

const syncPush = oneAtATime(async (): Promise<void> => {
    const { idpUrl, accessToken } = useAppStore.getState()
    if (!projectId || !idpUrl || !accessToken) return
    const deviceId = await getE2eePort().getDeviceId()
    const port = getPushRegistrationPort()
    if ((await readPushPermission()) !== "granted") {
        if (registered === false) return
        await port.unregister(idpUrl, accessToken, deviceId)
        registered = false
        return
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    await port.register(idpUrl, accessToken, deviceId, { relay: RELAY, token })
    registered = true
})

function syncNow(): void {
    syncPush().catch((error: unknown) => warnE2ee("keeping push notices registered", error))
}

/**
 * While this device is in: its registration set as the permission stands — again whenever the app comes back to
 * the front, where Android's settings may have changed it, and when the relay hands out another token — and the
 * notices shown cleared once the app is opened, what they told being on screen.
 */
export function keepPushRegistered(): () => void {
    const clear = () => void Notifications.dismissAllNotificationsAsync().catch(() => undefined)
    syncNow()
    clear()
    const stopVisibility = appVisibility.onChange(() => {
        if (!appVisibility.visible()) return
        syncNow()
        clear()
    })
    const tokens = Notifications.addPushTokenListener(() => syncNow())
    return () => {
        stopVisibility()
        tokens.remove()
        registered = null
    }
}

/** At sign-out, best effort: a device signed out is sent nothing anyway, having no live session. */
export function forgetPushRegistration(): void {
    const { idpUrl, accessToken } = useAppStore.getState()
    if (!projectId || !idpUrl || !accessToken || registered === false) return
    void Promise.resolve()
        .then(() => getE2eePort().getDeviceId())
        .then((deviceId) => getPushRegistrationPort().unregister(idpUrl, accessToken, deviceId))
        .catch((error: unknown) => warnE2ee("removing the push registration", error))
}
