import { badgeLabel } from "@pinai/domain/models/attention"

const SIZE = 32
// By the label's length: "99+" needs the smallest to stay inside the disc.
const FONT_SIZE = [0, 21, 17, 12]

/** The badge Windows lays over the taskbar button, as a PNG data URL; null at 0, or without a canvas. */
export function drawBadge(count: number): string | null {
    const label = badgeLabel(count)
    if (!label) return null
    const canvas = document.createElement("canvas")
    canvas.width = SIZE
    canvas.height = SIZE
    const context = canvas.getContext("2d")
    if (!context) return null
    context.fillStyle = "#d93036"
    context.beginPath()
    context.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, 2 * Math.PI)
    context.fill()
    context.fillStyle = "#ffffff"
    context.font = `700 ${FONT_SIZE[label.length]}px "DM Sans", system-ui, sans-serif`
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText(label, SIZE / 2, SIZE / 2 + 1, SIZE - 6)
    return canvas.toDataURL("image/png")
}
