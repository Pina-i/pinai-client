import { Search } from "lucide-react"
import { cn } from "@/presentation/_libs/utils"
import { popoverSurface } from "@/presentation/molecules/Popover/popover-surface"
import { useGifPopoverViewModel } from "./GifPopover.viewmodel"

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
 * Klipy-powered GIF search: search input + category pills + 2-column grid.
 * On select the GIF bytes are fetched, wrapped in a `File` and handed to the
 * composer's upload pipeline.
 */
export function GifPopover({ onPickGif }: GifPopoverProps) {
    const { configured, search, setSearch, activeCategory, pickCategory, gifs, isLoading, pickGif } =
        useGifPopoverViewModel(onPickGif)

    return (
        <div className={cn(popoverSurface, "w-[340px] overflow-hidden")}>
            <div className="flex items-baseline gap-2 border-b border-line px-4 pb-2.5 pt-3.5">
                <span className="title flex-1 text-[17px] font-normal">Send a GIF</span>
                <span className="fact">powered by klipy</span>
            </div>

            {!configured ? (
                <div className="px-4 py-6 text-center font-mono text-[10.5px] leading-relaxed text-muted-foreground">
                    GIF integration not configured.
                    <br />
                    Your instance's admin enables it with <span className="text-foreground">KLIPY_API_KEY</span>.
                </div>
            ) : (
                <>
                    <div className="px-3 pt-3">
                        <div className="flex h-9 items-center gap-[9px] rounded-full border border-line bg-surf2 px-3.5 text-muted-foreground">
                            <Search className="h-[15px] w-[15px] shrink-0" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search GIFs"
                                className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-1 px-3 pb-2 pt-2.5">
                        {CATEGORIES.map((c) => {
                            const isActive = activeCategory === c.key && search.trim().length === 0
                            return (
                                <button
                                    key={c.key || "trending"}
                                    type="button"
                                    onClick={() => pickCategory(c.key)}
                                    className={cn(
                                        "cursor-pointer rounded-full border px-3 py-[5px] text-[11.5px]",
                                        isActive
                                            ? "border-line2 bg-surf2 font-medium text-foreground"
                                            : "border-transparent bg-transparent text-muted-foreground hover:text-foreground",
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
                                onClick={() => pickGif(g)}
                                aria-label={g.description || "GIF"}
                                title={g.description}
                                className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-[12px] border border-line bg-surf2 hover:border-acc-line"
                            >
                                <img
                                    src={g.previewUrl}
                                    alt={g.description}
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                />
                                <span className="absolute right-1.5 top-1.5 rounded-full bg-[color-mix(in_oklab,var(--background)_70%,transparent)] px-1.5 py-px font-mono text-[8.5px] font-bold tracking-[0.06em] text-foreground backdrop-blur-[4px]">
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
