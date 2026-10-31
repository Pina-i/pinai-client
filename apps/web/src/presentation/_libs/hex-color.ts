/**
 * A CSS colour as `#rrggbb`, for what parses no `oklch()` (Electron's window colours): a canvas
 * paints it in sRGB and reads it back. Null without a 2D context.
 */
export function hexColor(css: string): string | null {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
    if (!context) return null
    context.fillStyle = css
    context.fillRect(0, 0, 1, 1)
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}
