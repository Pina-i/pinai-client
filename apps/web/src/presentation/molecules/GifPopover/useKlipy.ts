import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { gifSearchKeyUseCase } from "@pinai/domain/usecases/instance/gif-search-key.usecase"
import { getNodeInfoPort } from "@/ioc"
import { useAppStore } from "@/store/store"

/**
 * Klipy v1 wrapper.
 *
 * The key is the signed-in instance's, from its NodeInfo (`KLIPY_API_KEY` on the IdP). Without
 * one the popover renders a "not configured" placeholder instead of calling the API.
 *
 * Endpoint reference: https://docs.klipy.com (auth via api key in URL path).
 */
const KLIPY_BASE = "https://api.klipy.com/api/v1"

/**
 * The key the picker searches with: `undefined` while it is being read, `null` for none. Read once
 * a page load: a key changes about never, and a reload picks up a new one. An instance that can't
 * be read counts as none until the popover's next opening asks again.
 */
export function useGifSearchKey(): string | null | undefined {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const { data, isError } = useQuery({
        queryKey: ["gif-search-key", idpUrl],
        queryFn: () => gifSearchKeyUseCase(idpUrl!, getNodeInfoPort()),
        enabled: idpUrl !== null,
        staleTime: Infinity,
        // Kept while the popover is closed, or each opening would read NodeInfo again.
        gcTime: Infinity,
    })
    if (idpUrl === null) return null
    // A key read stays good even when a later read fails.
    if (data !== undefined) return data
    return isError ? null : undefined
}

/** Stable per-browser id Klipy uses for de-duplication / pagination affinity. */
function customerId(): string {
    const KEY = "klipy_customer_id"
    let id = localStorage.getItem(KEY)
    if (!id) {
        id = crypto.randomUUID()
        localStorage.setItem(KEY, id)
    }
    return id
}

export interface KlipyGif {
    id: string
    description: string
    /** Best-effort preview URL (small bytes for the grid). */
    previewUrl: string
    /** The full animation — the bytes the user wants to send. */
    gifUrl: string
    /** `image/webp`, or `image/gif` where Klipy has no WebP of it. */
    mimeType: string
    width: number
    height: number
}

interface KlipyVariant {
    url?: string
    width?: number
    height?: number
}
interface KlipyFileFormats {
    gif?: KlipyVariant
    mp4?: KlipyVariant
    webp?: KlipyVariant
}
interface KlipyRawItem {
    id?: string | number
    slug?: string
    title?: string
    file?: {
        hd?: KlipyFileFormats
        md?: KlipyFileFormats
        sm?: KlipyFileFormats
        xs?: KlipyFileFormats
    }
}

export interface KlipyEnvelope {
    result?: boolean
    data?: {
        data?: KlipyRawItem[]
    }
}

// The first tier that has it, its WebP before its GIF: the same animation, often several times lighter.
function pickVariant(
    item: KlipyRawItem,
    ...tiers: Array<"hd" | "md" | "sm" | "xs">
): { variant: KlipyVariant; mimeType: string } | null {
    for (const t of tiers) {
        const formats = item.file?.[t]
        if (formats?.webp?.url) return { variant: formats.webp, mimeType: "image/webp" }
        if (formats?.gif?.url) return { variant: formats.gif, mimeType: "image/gif" }
    }
    return null
}

export function parseResults(raw: KlipyEnvelope | undefined): KlipyGif[] {
    const items = raw?.data?.data ?? []
    return items
        .map((r): KlipyGif | null => {
            const preview = pickVariant(r, "sm", "xs", "md")
            const full = pickVariant(r, "md", "hd", "sm")
            if (!preview || !full) return null
            return {
                id: String(r.id ?? r.slug ?? ""),
                description: r.title ?? "",
                previewUrl: preview.variant.url ?? "",
                gifUrl: full.variant.url ?? "",
                mimeType: full.mimeType,
                width: full.variant.width ?? 0,
                height: full.variant.height ?? 0,
            }
        })
        .filter((g): g is KlipyGif => g != null && g.gifUrl.length > 0)
}

export function useKlipySearch(
    query: string,
    apiKey: string | null | undefined,
): { gifs: KlipyGif[]; isLoading: boolean } {
    const trimmed = query.trim()
    const { data, isLoading } = useQuery({
        queryKey: ["klipy", apiKey, "search", trimmed],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: "1",
                per_page: "20",
                customer_id: customerId(),
            })
            const path = trimmed.length > 0 ? "search" : "trending"
            if (trimmed.length > 0) params.set("q", trimmed)
            const endpoint = `${KLIPY_BASE}/${encodeURIComponent(apiKey!)}/gifs/${path}?${params.toString()}`
            const resp = await fetch(endpoint)
            if (!resp.ok) throw new Error(`Klipy request failed: ${resp.status}`)
            return resp.json() as Promise<KlipyEnvelope>
        },
        enabled: Boolean(apiKey),
        staleTime: 5 * 60 * 1000,
        // Keep the previous category's grid on screen while the next one fetches,
        // so the popover doesn't flash an empty/"Searching…" state on category swaps.
        placeholderData: keepPreviousData,
    })
    return { gifs: parseResults(data), isLoading }
}
