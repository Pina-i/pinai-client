/** What a flow swallowed, for whoever reads the device's log. */
export function warnE2ee(what: string, error: unknown): void {
    // eslint-disable-next-line no-console -- the device's log is where these go
    console.warn(`[e2ee] ${what}`, error instanceof Error ? error.message : error)
}
