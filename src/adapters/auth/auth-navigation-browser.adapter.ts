import type { IAuthNavigationPort } from "@/domain/ports/auth.port"

/**
 * Browser implementation of {@link IAuthNavigationPort}: the IdP hand-off is
 * a full document navigation, so `navigateTo` never returns — callers must
 * treat everything after it as unreachable.
 */
export class BrowserAuthNavigationAdapter implements IAuthNavigationPort {
    callbackUrl(): string {
        return `${window.location.origin}/callback`
    }

    postLogoutUrl(): string {
        return window.location.origin
    }

    currentLocation(): string {
        return window.location.pathname + window.location.search
    }

    navigateTo(url: string): void {
        window.location.href = url
    }
}
