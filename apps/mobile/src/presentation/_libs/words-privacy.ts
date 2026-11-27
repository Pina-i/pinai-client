import {
    allowScreenCaptureAsync,
    disableAppSwitcherProtectionAsync,
    enableAppSwitcherProtectionAsync,
    preventScreenCaptureAsync,
} from "expo-screen-capture"
import { useEffect, useId } from "react"
import { Platform } from "react-native"

// iOS's capture block leaves the app switcher's snapshot, which Android's FLAG_SECURE covers too: one switch for the
// whole app, so counted — a card leaving mustn't uncover another still up under it.
let switcherHolds = 0

/** While `active`: screenshots and recordings blocked, the app switcher's preview hidden. A key per caller. */
export function useWordsPrivacy(active = true): void {
    const key = useId()
    useEffect(() => {
        if (!active) return
        void preventScreenCaptureAsync(key)
        if (Platform.OS === "ios" && switcherHolds++ === 0) void enableAppSwitcherProtectionAsync(1)
        return () => {
            void allowScreenCaptureAsync(key)
            if (Platform.OS === "ios" && --switcherHolds === 0) void disableAppSwitcherProtectionAsync()
        }
    }, [active, key])
}
