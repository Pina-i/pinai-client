import { keepPreviousData, useQuery } from "@tanstack/react-query"

/**
 * Klipy v1 wrapper.
 *
 * Wired only when `VITE_KLIPY_API_KEY` is set at build time. Without a key the
 * popover renders a "not configured" placeholder instead of calling the API.
 *
 * Endpoint reference: https://docs.klipy.com (auth via api key in URL path).
 */
const KLIPY_BASE = "https://api.klipy.com/api/v1"
const KLIPY_KEY = (import.meta.env.VITE_KLIPY_API_KEY as string | undefined) ?? ""

export const KLIPY_ENABLED = KLIPY_KEY.length > 0

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
    /** Full GIF URL — the bytes the user wants to send. */
    gifUrl: string
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

interface KlipyEnvelope {
    result?: boolean
    data?: {
        data?: KlipyRawItem[]
    }
}

function pickGifUrl(item: KlipyRawItem, ...tiers: Array<"hd" | "md" | "sm" | "xs">): KlipyVariant | null {
    for (const t of tiers) {
        const variant = item.file?.[t]?.gif
        if (variant?.url) return variant
    }
    return null
}

function parseResults(raw: KlipyEnvelope | undefined): KlipyGif[] {
    const items = raw?.data?.data ?? []
    return items
        .map((r): KlipyGif | null => {
            const preview = pickGifUrl(r, "sm", "xs", "md")
            const full = pickGifUrl(r, "md", "hd", "sm")
            if (!preview || !full) return null
            return {
                id: String(r.id ?? r.slug ?? ""),
                description: r.title ?? "",
                previewUrl: preview.url ?? "",
                gifUrl: full.url ?? "",
                width: full.width ?? 0,
                height: full.height ?? 0,
            }
        })
        .filter((g): g is KlipyGif => g != null && g.gifUrl.length > 0)
}

export function useKlipySearch(query: string): { gifs: KlipyGif[]; isLoading: boolean } {
    const trimmed = query.trim()
    const { data, isLoading } = useQuery({
        queryKey: ["klipy", "search", trimmed],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: "1",
                per_page: "20",
                customer_id: customerId(),
            })
            const path = trimmed.length > 0 ? "search" : "trending"
            if (trimmed.length > 0) params.set("q", trimmed)
            const endpoint = `${KLIPY_BASE}/${KLIPY_KEY}/gifs/${path}?${params.toString()}`
            const resp = await fetch(endpoint)
            if (!resp.ok) throw new Error(`Klipy request failed: ${resp.status}`)
            return resp.json() as Promise<KlipyEnvelope>
        },
        enabled: KLIPY_ENABLED,
        staleTime: 5 * 60 * 1000,
        // Keep the previous category's grid on screen while the next one fetches,
        // so the popover doesn't flash an empty/"Searching…" state on category swaps.
        placeholderData: keepPreviousData,
    })
    return { gifs: parseResults(data), isLoading }
}
