import type { CSSProperties } from "react"
import type { MotifKey } from "@pinai/domain/models/user-settings"
import kowhaiwhai from "@/assets/motifs/kowhaiwhai.svg"
import puhoroField from "@/assets/motifs/puhoro.svg"
import puhoroBand from "@/assets/motifs/puhoro-band.svg"
import raranga from "@/assets/motifs/raranga.svg"
import tapa1 from "@/assets/motifs/tapa1.svg"
import tapa2 from "@/assets/motifs/tapa2.svg"
import tapa3 from "@/assets/motifs/tapa3.svg"
import tapa4 from "@/assets/motifs/tapa4.svg"
import { useAppearance } from "@/presentation/providers/AppearanceProvider/AppearanceProvider.context"
import { cn } from "@/presentation/_libs/utils"

interface Tile {
    src: string
    /** Width / height of the SVG's viewBox. */
    ratio: number
    /** Default tile height in px. */
    size: number
}

// Each motif is one unit that repeats. Puhoro is the only wide artwork (the
// 1575×412 rafter), so its band crops to a single koru (230×92) — an 11px
// rule of the whole band would scale its spirals away.
const TILES: Record<MotifKey, { field: Tile; band: Tile }> = {
    kowhaiwhai: { field: { src: kowhaiwhai, ratio: 500 / 33.6, size: 38 }, band: { src: kowhaiwhai, ratio: 500 / 33.6, size: 15 } },
    raranga: { field: { src: raranga, ratio: 48 / 24, size: 34 }, band: { src: raranga, ratio: 48 / 24, size: 22 } },
    puhoro: { field: { src: puhoroField, ratio: 1575 / 412, size: 108 }, band: { src: puhoroBand, ratio: 230 / 92, size: 16 } },
    tapa1: { field: { src: tapa1, ratio: 500 / 18, size: 30 }, band: { src: tapa1, ratio: 500 / 18, size: 13 } },
    tapa2: { field: { src: tapa2, ratio: 500 / 25.7, size: 40 }, band: { src: tapa2, ratio: 500 / 25.7, size: 16 } },
    tapa3: { field: { src: tapa3, ratio: 500 / 21, size: 34 }, band: { src: tapa3, ratio: 500 / 21, size: 14 } },
    tapa4: { field: { src: tapa4, ratio: 500 / 27.6, size: 44 }, band: { src: tapa4, ratio: 500 / 27.6, size: 18 } },
}

interface MotifProps {
    /** `field` tiles a surface; `band` is a rule (the date divider, the auth masthead). */
    variant: "field" | "band"
    /** Which pattern. Defaults to the one chosen in Appearance. */
    motif?: MotifKey
    /** Tile height in px. Defaults to the motif's own size for the variant. */
    size?: number
    /** Any CSS colour — a token like `var(--accline)` keeps every theme right. */
    color?: string
    className?: string
    style?: CSSProperties
}

// The SVG masks a solid colour instead of being a background image, so the
// pattern follows the palette token rather than baking one colour in.
export function Motif({ variant, motif, size, color = "var(--acc)", className, style }: MotifProps) {
    const { appearance } = useAppearance()
    const tile = TILES[motif ?? appearance.motif][variant]
    const height = size ?? tile.size
    const width = Math.round(height * tile.ratio * 100) / 100
    const mask = `url("${tile.src}")`
    const maskSize = `${width}px ${height}px`

    return (
        <div
            aria-hidden
            className={cn("pointer-events-none", className)}
            style={{
                backgroundColor: color,
                maskImage: mask,
                WebkitMaskImage: mask,
                maskSize,
                WebkitMaskSize: maskSize,
                maskRepeat: "repeat",
                WebkitMaskRepeat: "repeat",
                ...style,
            }}
        />
    )
}
