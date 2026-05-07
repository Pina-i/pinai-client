import { useQuery } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { getDmPort } from "@/ioc"

/**
 * Resolve a token-protected blob URL for an attachment id.
 *
 * The IdP issues these URLs with an HMAC token valid for ~1h. We cache for
 * 50 minutes so the cached URL never expires mid-render; on stale, the next
 * mount automatically refetches a fresh token.
 *
 * Returns `null` while the request is in flight so callers can render a
 * lightweight placeholder.
 */
export function useAttachmentBlobUrl(attachmentId: string | undefined): string | null {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)

    const enabled = !!attachmentId && !!accessToken && !!idpUrl

    const { data } = useQuery({
        queryKey: ["attachment-blob-url", idpUrl ?? "", attachmentId ?? ""],
        queryFn: () => getDmPort().getAttachmentBlobUrl(idpUrl!, accessToken!, attachmentId!),
        enabled,
        staleTime: 50 * 60 * 1000,
    })

    return data ?? null
}
