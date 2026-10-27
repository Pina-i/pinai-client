import type { AnyRouter } from "@tanstack/react-router"

/** Where the app is, without `param`; `null` when the URL doesn't carry it. */
export function withoutSearchParam(location: { pathname: string; searchStr: string }, param: string): string | null {
    const search = new URLSearchParams(location.searchStr)
    if (!search.has(param)) return null
    search.delete(param)
    const rest = search.toString()
    return rest ? `${location.pathname}?${rest}` : location.pathname
}

/** Once a screen has taken `param`, the URL drops it, in place: a reload or a sign-in coming back must not take it again. */
export function dropSearchParam(router: AnyRouter, param: string): void {
    const href = withoutSearchParam(router.state.location, param)
    if (href !== null) void router.navigate({ href, replace: true })
}
