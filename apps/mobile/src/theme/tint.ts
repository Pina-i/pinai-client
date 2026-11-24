/** A theme colour (`#rrggbb`) at an opacity, as the web's `color-mix(in oklab, <colour> N%, transparent)`. */
export function tint(hex: string, opacity: number): string {
    const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255)
    return `${hex.slice(0, 7)}${alpha.toString(16).padStart(2, "0")}`
}
