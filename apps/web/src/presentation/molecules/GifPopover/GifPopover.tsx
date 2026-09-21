import { useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/presentation/_libs/utils"
import { KLIPY_ENABLED, useKlipySearch, type KlipyGif } from "./useKlipy"

interface GifPopoverProps {
    /**
     * Called once a GIF has been fetched as bytes. The parent pushes the file
     * through the same upload pipeline as a regular attachment so the GIF
     * federates exactly like any other file.
     */
    onPickGif: (file: File) => void
}

const CATEGORIES: ReadonlyArray<{ key: string; label: string }> = [
    { key: "", label: "Trending" },
    { key: "celebrate", label: "Reactions" },
    { key: "hello", label: "Greetings" },
    { key: "wow", label: "Mood" },
]

/**
 * Klipy-powered GIF search popover. Shape matches the prototype's `GifPopover`
 * but the data is live: search input + category pills + 2-column thumbnail grid.
 *
 * On select: fetch the GIF bytes from Klipy's CDN, wrap in a `File`, hand off
 * to the composer's upload pipeline.
 */
export function GifPopover({ onPickGif }: GifPopoverProps) {
    const [search, setSearch] = useState("")
    const [activeCategory, setActiveCategory] = useState<string>("")

    const effectiveQuery = search.trim().length > 0 ? search : activeCategory
    const { gifs, isLoading } = useKlipySearch(effectiveQuery)

    async function handlePick(gif: KlipyGif) {
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

    return (
        <div
            className={cn(
                "w-[340px] overflow-hidden rounded-[var(--radius-lg)] border border-border-strong",
                "bg-popover text-popover-foreground shadow-[0_16px_40px_oklch(0.05_0.005_60_/_0.45)]",
            )}
        >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <span className="title flex-1 text-[13.5px] font-medium">Send a GIF</span>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
                    powered by klipy
                </span>
            </div>

            {!KLIPY_ENABLED ? (
                <div className="px-4 py-6 text-center font-mono text-[11px] leading-relaxed text-muted-foreground">
                    GIF integration not configured.
                    <br />
                    Set <span className="text-foreground">VITE_KLIPY_API_KEY</span> at build time to enable.
                </div>
            ) : (
                <>
                    <div className="px-3 pt-2.5">
                        <div
                            className={cn(
                                "flex h-[30px] items-center gap-2 rounded-[var(--radius-sm)] border border-border px-2.5",
                                "bg-input text-muted-foreground",
                            )}
                        >
                            <Search className="h-3.5 w-3.5 shrink-0" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search GIFs"
                                className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-2">
                        {CATEGORIES.map((c) => {
                            const isActive = activeCategory === c.key && search.trim().length === 0
                            return (
                                <button
                                    key={c.key || "trending"}
                                    type="button"
                                    onClick={() => {
                                        setActiveCategory(c.key)
                                        setSearch("")
                                    }}
                                    className={cn(
                                        "cursor-pointer rounded-full border px-2 py-[3px] font-mono text-[10.5px] tracking-[0.04em]",
                                        isActive
                                            ? "border-border bg-[color-mix(in_oklab,var(--chat)_14%,transparent)] text-chat"
                                            : "border-border bg-transparent text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {c.label}
                                </button>
                            )
                        })}
                    </div>

                    <div className="grid max-h-[260px] grid-cols-2 gap-1.5 overflow-y-auto px-3 pb-3">
                        {isLoading && gifs.length === 0 && (
                            <div className="col-span-2 py-8 text-center font-mono text-[10.5px] text-muted-foreground">
                                Searching…
                            </div>
                        )}
                        {!isLoading && gifs.length === 0 && (
                            <div className="col-span-2 py-8 text-center font-mono text-[10.5px] text-muted-foreground">
                                No GIFs found.
                            </div>
                        )}
                        {gifs.map((g) => (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => handlePick(g)}
                                aria-label={g.description || "GIF"}
                                title={g.description}
                                className={cn(
                                    "relative aspect-[4/3] cursor-pointer overflow-hidden rounded-lg border border-border",
                                    "bg-muted hover:border-border-strong",
                                )}
                            >
                                <img
                                    src={g.previewUrl}
                                    alt={g.description}
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                />
                                <span
                                    className={cn(
                                        "absolute right-1.5 top-1.5 rounded-[3px] px-1.5 py-px",
                                        "font-mono text-[8.5px] text-foreground",
                                    )}
                                    style={{ background: "oklch(0.18 0.01 60 / 0.7)" }}
                                >
                                    GIF
                                </span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
