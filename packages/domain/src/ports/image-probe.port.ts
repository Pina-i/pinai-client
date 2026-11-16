import type { LocalFile } from "../models/file"
import type { ImagePreview } from "../models/image-preview"

/** Reads an image's size and makes its blurhash: decoding pixels is each platform's. */
export interface IImageProbePort {
    /** `null` for a file that isn't an image this platform decodes; never throws. */
    probe(file: LocalFile): Promise<ImagePreview | null>
}
