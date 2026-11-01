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
            // Force `image/gif` regardless of what Klipy's CDN reports.
            // Some CDN edges return `application/octet-stream` (or
            // `binary/octet-stream`) for larger frames; without this
            // pin, the recipient's `isImageAttachment` check on the
            // decrypted `AttachmentBlobKey.mime_type` would render the
            // GIF as a generic file tile instead of an image tile.
            const file = new File([blob], `${gif.id}.gif`, { type: "image/gif" })
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
