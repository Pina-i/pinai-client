import { useState } from "react"
import { toast } from "sonner"
import { useDebouncedValue } from "@/presentation/hooks/use-debounced-value"
import { useGifSearchKey, useKlipySearch, type KlipyGif } from "./useKlipy"

/** How long typing pauses before a search goes out: every request counts against the key's quota. */
export const GIF_SEARCH_DEBOUNCE_MS = 350

export function useGifPopoverViewModel(onPickGif: (file: File) => void) {
    const [search, setSearch] = useState("")
    const [activeCategory, setActiveCategory] = useState<string>("")
    const debouncedSearch = useDebouncedValue(search, GIF_SEARCH_DEBOUNCE_MS)
    const apiKey = useGifSearchKey()

    // A category answers at once; typed text once it settles, the category's grid shown until then.
    const typed = search.trim().length > 0 ? debouncedSearch.trim() : ""
    const effectiveQuery = typed.length > 0 ? typed : activeCategory
    const { gifs, isLoading } = useKlipySearch(effectiveQuery, apiKey)

    function pickCategory(key: string) {
        setActiveCategory(key)
        setSearch("")
    }

    async function pickGif(gif: KlipyGif) {
        try {
            const resp = await fetch(gif.gifUrl)
            if (!resp.ok) throw new Error(`Failed to load GIF: ${resp.status}`)
            const blob = await resp.blob()
            // The type Klipy listed, not the CDN's: some edges answer `application/octet-stream`, and
            // the recipient would then show a file tile instead of the image.
            const extension = gif.mimeType === "image/webp" ? "webp" : "gif"
            const file = new File([blob], `${gif.id}.${extension}`, { type: gif.mimeType })
            onPickGif(file)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not load GIF.")
        }
    }

    return {
        /** `false` once it is known there is no key; `true` while it is read, so no placeholder flashes. */
        configured: apiKey !== null,
        search,
        setSearch,
        activeCategory,
        pickCategory,
        gifs,
        isLoading: isLoading || apiKey === undefined,
        pickGif,
    }
}
