import type { AttachmentBlobKey } from "./e2ee"

/** What a timeline knows of an image before it loads: its size, and a blurhash of it when one was made. */
export interface ImagePreview {
    width: number
    height: number
    blurhash: string | null
}

/** Larger than any camera's: a side past it is a lie, not a photo. */
export const MAX_IMAGE_SIDE = 20_000

const BASE83 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"

/**
 * The preview an attachment key carries, `null` without a sane size. The key comes from a peer's
 * message, so nothing in it is trusted to lay the timeline out: a size must be whole and within
 * {@link MAX_IMAGE_SIDE}, and a blurhash well-formed — or it is dropped, the size kept.
 */
export function imagePreviewOf(key: AttachmentBlobKey | undefined): ImagePreview | null {
    if (!key || !isSide(key.width) || !isSide(key.height)) return null
    return { width: key.width, height: key.height, blurhash: isBlurhash(key.blurhash) ? key.blurhash : null }
}

function isSide(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_IMAGE_SIDE
}

// Its first character gives the component counts, which give its length.
function isBlurhash(value: unknown): value is string {
    if (typeof value !== "string" || value.length < 6) return false
    for (const char of value) if (!BASE83.includes(char)) return false
    const size = BASE83.indexOf(value[0])
    const x = (size % 9) + 1
    const y = Math.floor(size / 9) + 1
    return value.length === 4 + 2 * x * y
}
