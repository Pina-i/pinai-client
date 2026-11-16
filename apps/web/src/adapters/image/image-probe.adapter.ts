import { encode } from "blurhash"

import type { LocalFile } from "@pinai/domain/models/file"
import type { ImagePreview } from "@pinai/domain/models/image-preview"
import type { IImageProbePort } from "@pinai/domain/ports/image-probe.port"

// Enough pixels for a blurhash: it keeps a handful of colour components.
const SAMPLE_SIDE = 32

/** {@link IImageProbePort} on the browser's decoder: the size as an `<img>` shows it, EXIF orientation applied. */
export class CanvasImageProbeAdapter implements IImageProbePort {
    async probe(file: LocalFile): Promise<ImagePreview | null> {
        if (!file.mimeType.startsWith("image/")) return null
        let bitmap: ImageBitmap
        try {
            bitmap = await createImageBitmap(new Blob([file.bytes as BlobPart], { type: file.mimeType }))
        } catch {
            return null
        }
        try {
            const { width, height } = bitmap
            if (width === 0 || height === 0) return null
            return { width, height, blurhash: blurhashOf(bitmap) }
        } finally {
            bitmap.close()
        }
    }
}

function blurhashOf(bitmap: ImageBitmap): string | null {
    const scale = SAMPLE_SIDE / Math.max(bitmap.width, bitmap.height)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) return null
    context.drawImage(bitmap, 0, 0, width, height)
    const { data } = context.getImageData(0, 0, width, height)
    // More components along the longer side, as the image runs.
    const landscape = bitmap.width >= bitmap.height
    return encode(data, width, height, landscape ? 4 : 3, landscape ? 3 : 4)
}
