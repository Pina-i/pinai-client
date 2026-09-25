import type { CSSProperties } from "react"
import puhoroField from "@/assets/motifs/puhoro.svg"
import puhoroBand from "@/assets/motifs/puhoro-band.svg"
import { cn } from "@/presentation/_libs/utils"

// Aspect ratios of the two viewBoxes: the full 1575×412 rafter, and the
// 230×92 crop down to a single koru so an 11px rule still reads as a curl.
const TILES = {
    field: { src: puhoroField, ratio: 1575 / 412, size: 108 },
    band: { src: puhoroBand, ratio: 230 / 92, size: 16 },
} as const

interface MotifProps {
    /** `field` tiles a surface; `band` is a rule (the date divider, the auth masthead). */
    variant: "field" | "band"
    /** Tile height in px. Defaults to 108 for a field, 16 for a band. */
    size?: number
    /** Any CSS colour — a token like `var(--accline)` keeps both modes right. */
    color?: string
    className?: string
    style?: CSSProperties
}

// The SVG masks a solid colour instead of being a background image, so the
// pattern follows the palette token rather than baking one colour in.
export function Motif({ variant, size, color = "var(--acc)", className, style }: MotifProps) {
    const tile = TILES[variant]
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
