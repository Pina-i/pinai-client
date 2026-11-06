export function warnE2ee(what: string, error: unknown): void {
    // eslint-disable-next-line no-console
    console.warn(`[e2ee] ${what}`, error instanceof Error ? error.message : error)
}

/** {@link warnE2ee} as a `catch` handler. */
export function warnOf(what: string): (error: unknown) => void {
    return (error) => warnE2ee(what, error)
}
