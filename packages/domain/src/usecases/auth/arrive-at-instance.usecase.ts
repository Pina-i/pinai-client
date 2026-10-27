import { instanceArrival, type InstanceArrival } from "../../models/instance"
import type { AuthPlatform } from "../../ports/auth.port"

/**
 * The app opened on `?instance=`. It never signs in by itself: a link must not make the app a
 * silent way into any instance's sign-in page, so another instance is only filled in on the
 * landing. Signed in to another one, that session is dropped first, here, as a refused refresh
 * token drops it: its IdP's browser session is left alone, its account's data stays on the device.
 *
 * `dropSession` clears what the app holds of the session and forgets its IdP; `signedInTo` is the
 * IdP the app signs in to.
 */
export function arriveAtInstanceUseCase(
    asked: string | null,
    signedInTo: string | null,
    dropSession: () => void,
    platform: AuthPlatform,
): InstanceArrival {
    // An app holding a session of its own (the desktop) isn't opened by a link.
    if (!platform.browserSession) return { kind: "none" }
    const arrival = instanceArrival(asked, signedInTo)
    if (arrival.kind === "pick" && arrival.leaving) {
        platform.tokens.clear()
        dropSession()
    }
    return arrival
}
