import type { Attachment } from "@/domain/models/dm"

/** True for any image/* MIME type. */
export function isImageAttachment(attachment: Attachment): boolean {
    return attachment.mime_type.startsWith("image/")
}

/**
 * Compact human-readable byte count.
 * Mirrors the prototype's "2.1 MB" / "620 KB" / "4.2 KB" style.
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

/** Filename extension uppercased for the file-tile badge. Falls back to "FILE". */
export function extensionBadge(filename: string): string {
    const dot = filename.lastIndexOf(".")
    if (dot < 0 || dot === filename.length - 1) return "FILE"
    return filename.slice(dot + 1).toUpperCase().slice(0, 4)
}

/** Trigger a save-as for a remote URL using its `download` attribute. */
export function downloadAttachment(url: string, filename: string): void {
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    a.remove()
}
