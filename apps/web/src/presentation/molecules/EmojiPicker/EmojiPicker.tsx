import { useEffect, useMemo, useState } from "react"
import {
    Autocomplete,
    GridLayout,
    Input,
    ListBox,
    ListBoxItem,
    SearchField,
    Size,
    Virtualizer,
} from "react-aria-components"
import { Search } from "lucide-react"
import { cn } from "@/presentation/_libs/utils"

interface CompactEmoji {
    hexcode: string
    label: string
    unicode: string
    tags?: string[]
    group?: number
    skins?: CompactEmoji[]
}

interface EmojiItem {
    id: string
    emoji: string
    /** Pre-lowercased label + tags. Compared via plain .includes() for fast keystroke filtering. */
    searchText: string
    group: number
}

// Static map → Vite emits one async chunk per locale, only the matching one is fetched.
const localeLoaders: Record<string, () => Promise<{ default: CompactEmoji[] }>> = {
    bn: () => import("emojibase-data/bn/compact.json"),
    da: () => import("emojibase-data/da/compact.json"),
    de: () => import("emojibase-data/de/compact.json"),
    en: () => import("emojibase-data/en/compact.json"),
    "en-gb": () => import("emojibase-data/en-gb/compact.json"),
    es: () => import("emojibase-data/es/compact.json"),
    "es-mx": () => import("emojibase-data/es-mx/compact.json"),
    et: () => import("emojibase-data/et/compact.json"),
    fi: () => import("emojibase-data/fi/compact.json"),
    fr: () => import("emojibase-data/fr/compact.json"),
    hi: () => import("emojibase-data/hi/compact.json"),
    hu: () => import("emojibase-data/hu/compact.json"),
    it: () => import("emojibase-data/it/compact.json"),
    ja: () => import("emojibase-data/ja/compact.json"),
    ko: () => import("emojibase-data/ko/compact.json"),
    lt: () => import("emojibase-data/lt/compact.json"),
    ms: () => import("emojibase-data/ms/compact.json"),
    nb: () => import("emojibase-data/nb/compact.json"),
    nl: () => import("emojibase-data/nl/compact.json"),
    pl: () => import("emojibase-data/pl/compact.json"),
    pt: () => import("emojibase-data/pt/compact.json"),
    ru: () => import("emojibase-data/ru/compact.json"),
    sv: () => import("emojibase-data/sv/compact.json"),
    th: () => import("emojibase-data/th/compact.json"),
    uk: () => import("emojibase-data/uk/compact.json"),
    vi: () => import("emojibase-data/vi/compact.json"),
    zh: () => import("emojibase-data/zh/compact.json"),
    "zh-hant": () => import("emojibase-data/zh-hant/compact.json"),
}

/** Picks the best matching emojibase locale for navigator.language. Falls back to base language, then English. */
function detectLocale(): string {
    const lang = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase()
    if (lang in localeLoaders) return lang
    const base = lang.split("-")[0]
    if (base in localeLoaders) return base
    return "en"
}

function processEmojis(raw: CompactEmoji[]): EmojiItem[] {
    return raw
        .filter(
            (e) =>
                !e.label.startsWith("regional indicator") &&
                e.group !== undefined &&
                e.group !== 2,
        )
        .map((e) => ({
            id: e.unicode,
            emoji: e.unicode,
            searchText: `${e.label} ${(e.tags ?? []).join(" ")}`.toLowerCase(),
            group: e.group as number,
        }))
}

// Module-level cache: first open does the fetch + parse + preprocess; every
// subsequent mount is synchronous.
let cachedItems: EmojiItem[] | null = null
let inFlight: Promise<EmojiItem[]> | null = null

async function loadItems(): Promise<EmojiItem[]> {
    if (cachedItems) return cachedItems
    if (inFlight) return inFlight
    inFlight = (async () => {
        const locale = detectLocale()
        try {
            const mod = await localeLoaders[locale]()
            cachedItems = processEmojis(mod.default)
            return cachedItems
        } catch {
            // Locale chunk failed (e.g. offline) — fall back to English.
            const mod = await localeLoaders.en()
            cachedItems = processEmojis(mod.default)
            return cachedItems
        } finally {
            inFlight = null
        }
    })()
    return inFlight
}

interface CategoryDef {
    group: number
    label: string
    icon: string
}

const categories: CategoryDef[] = [
    { group: 0, label: "Smileys & Emotion", icon: "😀" },
    { group: 1, label: "People & Body", icon: "👋" },
    { group: 3, label: "Animals & Nature", icon: "🐶" },
    { group: 4, label: "Food & Drink", icon: "🍔" },
    { group: 5, label: "Travel & Places", icon: "🚗" },
    { group: 6, label: "Activities", icon: "⚽" },
    { group: 7, label: "Objects", icon: "💡" },
    { group: 8, label: "Symbols", icon: "❤️" },
    { group: 9, label: "Flags", icon: "🏁" },
]

// Stable Size instances. RA's GridLayout calls minItemSize.equals(other), so
// the values must be Size objects, and recreating them per render thrashes
// the layout-invalidation check.
const LAYOUT_OPTIONS = {
    minItemSize: new Size(32, 32),
    minSpace: new Size(4, 4),
}

/** Stable filter — lowercase substring match. Faster than useFilter's locale-aware contains for ~2000 emoji names. */
function emojiFilter(textValue: string, inputValue: string): boolean {
    return textValue.includes(inputValue.toLowerCase())
}

interface EmojiPickerProps {
    /** Fired when the user selects an emoji (clicks or hits Enter). The emoji's unicode character is passed. */
    onEmojiSelect: (emoji: string) => void
}

export function EmojiPicker({ onEmojiSelect }: EmojiPickerProps) {
    const [items, setItems] = useState<EmojiItem[] | null>(cachedItems)
    const [activeGroup, setActiveGroup] = useState<number>(0)
    const [searchText, setSearchText] = useState("")

    useEffect(() => {
        if (items) return
        let cancelled = false
        loadItems().then((loaded) => {
            if (!cancelled) setItems(loaded)
        })
        return () => {
            cancelled = true
        }
    }, [items])

    const visibleItems = useMemo(() => {
        if (!items) return []
        return searchText.trim()
            ? items
            : items.filter((i) => i.group === activeGroup)
    }, [items, activeGroup, searchText])

    function selectCategory(group: number) {
        setActiveGroup(group)
        setSearchText("")
    }

    if (!items) {
        return (
            <div className="flex h-[348px] w-80 items-center justify-center p-2 text-xs text-muted-foreground">
                Loading emojis…
            </div>
        )
    }

    return (
        <div className="flex w-80 flex-col gap-2 p-2">
            {/* Category strip */}
            <div className="flex gap-0.5 border-b border-border pb-1.5">
                {categories.map((cat) => {
                    const isActive = activeGroup === cat.group && !searchText
                    return (
                        <button
                            key={cat.group}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectCategory(cat.group)}
                            aria-label={cat.label}
                            title={cat.label}
                            aria-pressed={isActive}
                            className={cn(
                                "flex h-7 flex-1 items-center justify-center rounded text-base outline-none transition-colors cursor-pointer",
                                "focus-visible:ring-2 focus-visible:ring-ring",
                                isActive
                                    ? "bg-accent"
                                    : "opacity-60 hover:bg-accent/50 hover:opacity-100",
                            )}
                        >
                            {cat.icon}
                        </button>
                    )
                })}
            </div>

            <Autocomplete
                inputValue={searchText}
                onInputChange={setSearchText}
                filter={emojiFilter}
            >
                <SearchField
                    aria-label="Search emojis"
                    autoFocus
                    className="flex h-9 items-center gap-2 rounded-md border border-border bg-input px-3"
                >
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                        placeholder="Search emoji…"
                        className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                    />
                </SearchField>
                <Virtualizer layout={GridLayout} layoutOptions={LAYOUT_OPTIONS}>
                    <ListBox
                        aria-label="Emojis"
                        layout="grid"
                        items={visibleItems}
                        onAction={(key) => onEmojiSelect(String(key))}
                        renderEmptyState={() => (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                No emoji found
                            </div>
                        )}
                        className="h-64 overflow-auto outline-none"
                    >
                        {(item) => (
                            <ListBoxItem
                                id={item.id}
                                textValue={item.searchText}
                                className="flex items-center justify-center text-xl cursor-pointer outline-none rounded transition-colors hover:bg-accent focus:bg-accent"
                            >
                                {item.emoji}
                            </ListBoxItem>
                        )}
                    </ListBox>
                </Virtualizer>
            </Autocomplete>
        </div>
    )
}
