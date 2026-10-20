import type { IAuthPort, ISessionTokenStore } from "../../ports/auth.port"

export type Renewal =
    | { kind: "renewed"; accessToken: string }
    /** The IdP refused the refresh token, or none is held: only signing in again brings the session back. */
    | { kind: "ended" }
    /** The IdP couldn't be reached: the refresh token is kept, to present again. */
    | { kind: "unreachable" }

/**
 * Renews the session with its refresh token. One renewal at a time, whoever asks — a timer, a
 * refused request, a closed socket — all get its outcome: the IdP rotates the token at each use,
 * and a token presented twice can end the session. Wherever the token waits: the page's memory
 * on the web, the desktop's main process.
 */
export function renewSessionUseCase(authPort: IAuthPort, tokens: ISessionTokenStore): () => Promise<Renewal> {
    let running: Promise<Renewal> | null = null
    return () => {
        running ??= renew(authPort, tokens).finally(() => {
            running = null
        })
        return running
    }
}

async function renew(authPort: IAuthPort, tokens: ISessionTokenStore): Promise<Renewal> {
    const held = tokens.take()
    if (!held) return { kind: "ended" }
    let issued
    try {
        issued = await authPort.refresh({
            tokenEndpoint: held.tokenEndpoint,
            clientId: held.clientId,
            refreshToken: held.refreshToken,
        })
    } catch {
        // If the IdP did rotate it and only the answer was lost, it answers this token again within a minute.
        tokens.set(held)
        return { kind: "unreachable" }
    }
    if (!issued) return { kind: "ended" }
    tokens.set({ ...held, refreshToken: issued.refreshToken })
    return { kind: "renewed", accessToken: issued.accessToken }
}
