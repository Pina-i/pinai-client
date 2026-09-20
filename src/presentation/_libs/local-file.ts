import type { LocalFile } from "@/domain/models/file"

/**
 * Browser `File`/`Blob` → the domain's {@link LocalFile}.
 *
 * Lives in the presentation layer because `File` and `Blob` are this
 * platform's way of handing over a picked file; a React Native app has its
 * own conversion from whatever its picker returns.
 */
export async function fileToLocalFile(file: File): Promise<LocalFile> {
    return {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes: new Uint8Array(await file.arrayBuffer()),
    }
}

/** Same, for a `Blob` that has no name of its own (a canvas export, say). */
export async function blobToLocalFile(blob: Blob, name: string): Promise<LocalFile> {
    return {
        name,
        mimeType: blob.type || "application/octet-stream",
        bytes: new Uint8Array(await blob.arrayBuffer()),
    }
}
