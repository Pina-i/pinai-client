/** The scheme every IdP's desktop client document lists its callback under. */
export const SCHEME = "io.github.pina-i"

/**
 * The app path a deep link opens: the sign-in callback, with the IdP's answer, and nothing else.
 * Any other link — another path, another scheme — opens nothing.
 */
export function callbackPath(link: string): string | null {
    let url: URL
    try {
        url = new URL(link)
    } catch {
        return null
    }
    if (url.protocol !== `${SCHEME}:` || url.pathname !== "/callback") return null
    return `/callback${url.search}`
}

/** The deep link among a launch's arguments, as Linux and Windows pass it. */
export function linkIn(argv: readonly string[]): string | null {
    return argv.find((arg) => arg.startsWith(`${SCHEME}:`)) ?? null
}
