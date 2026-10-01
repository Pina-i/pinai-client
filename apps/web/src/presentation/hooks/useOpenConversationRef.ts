import { useLocation } from "@tanstack/react-router"

/**
 * What the `/dm/$name` route names: a conversation id, or the address of someone the user has no
 * conversation with yet. The route, not the effect-set `activeDm`, which for the latter holds a
 * freshly minted id that names nobody.
 */
export function useOpenConversationRef(): string | null {
    return useLocation({
        select: (l) => (l.pathname.startsWith("/dm/") ? decodeURIComponent(l.pathname.slice(4)) : null),
    })
}
