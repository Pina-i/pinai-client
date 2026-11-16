import { decode } from "blurhash"

// Stretched over the image's box: a blur has no detail to lose.
const SIDE = 32
const KEPT = 500

const decoded = new Map<string, string | null>()

/** A blurhash as an image URL, decoded once a page load; `null` where no canvas draws it. */
export function blurhashImage(hash: string): string | null {
    const known = decoded.get(hash)
    if (known !== undefined) return known
    const url = draw(hash)
    if (decoded.size >= KEPT) decoded.delete(decoded.keys().next().value as string)
    decoded.set(hash, url)
    return url
}

function draw(hash: string): string | null {
    try {
        const canvas = document.createElement("canvas")
        canvas.width = SIDE
        canvas.height = SIDE
        const context = canvas.getContext("2d")
        if (!context) return null
        const image = context.createImageData(SIDE, SIDE)
        image.data.set(decode(hash, SIDE, SIDE))
        context.putImageData(image, 0, 0)
        return canvas.toDataURL()
    } catch {
        return null
    }
}
