import { useQuery } from "@tanstack/react-query"

/**
 * Tenor v2 wrapper.
 *
 * Wired only when `VITE_TENOR_API_KEY` is set at build time. Without a key the
 * popover renders a "not configured" placeholder instead of calling the API.
 *
 * Endpoint reference: https://developers.google.com/tenor/guides/endpoints
 */
const TENOR_BASE = "https://tenor.googleapis.com/v2"
const TENOR_KEY = (import.meta.env.VITE_TENOR_API_KEY as string | undefined) ?? ""

export const TENOR_ENABLED = TENOR_KEY.length > 0

export interface TenorGif {
    id: string
    description: string
    /** Best-effort preview URL (mp4 for animation, low byte count). */
    previewUrl: string
    /** Full GIF URL — the bytes the user wants to send. */
    gifUrl: string
    width: number
    height: number
}

interface TenorRawMedia {
    url: string
    dims?: [number, number]
}
interface TenorRawResult {
    id: string
    content_description?: string
    media_formats?: Record<string, TenorRawMedia>
}

function pickFormat(formats: Record<string, TenorRawMedia>, ...names: string[]): TenorRawMedia | null {
    for (const n of names) {
        if (formats[n]) return formats[n]
    }
    return null
}

function parseResults(raw: { results?: TenorRawResult[] } | undefined): TenorGif[] {
    if (!raw?.results) return []
    return raw.results
        .map((r): TenorGif | null => {
            const formats = r.media_formats ?? {}
            const preview = pickFormat(formats, "tinygif", "nanogif", "gif")
            const gif = pickFormat(formats, "gif", "mediumgif", "tinygif")
            if (!preview || !gif) return null
            return {
                id: r.id,
                description: r.content_description ?? "",
                previewUrl: preview.url,
                gifUrl: gif.url,
                width: gif.dims?.[0] ?? 0,
                height: gif.dims?.[1] ?? 0,
            }
        })
        .filter((g): g is TenorGif => g != null)
}

export function useTenorSearch(query: string): { gifs: TenorGif[]; isLoading: boolean } {
    const trimmed = query.trim()
    const { data, isLoading } = useQuery({
        queryKey: ["tenor", "search", trimmed],
        queryFn: async () => {
            const endpoint = trimmed.length > 0
                ? `${TENOR_BASE}/search?q=${encodeURIComponent(trimmed)}&key=${TENOR_KEY}&limit=20&media_filter=gif,tinygif`
                : `${TENOR_BASE}/featured?key=${TENOR_KEY}&limit=20&media_filter=gif,tinygif`
            const resp = await fetch(endpoint)
            if (!resp.ok) throw new Error(`Tenor request failed: ${resp.status}`)
            return resp.json()
        },
        enabled: TENOR_ENABLED,
        staleTime: 5 * 60 * 1000,
    })
    return { gifs: parseResults(data), isLoading }
}
