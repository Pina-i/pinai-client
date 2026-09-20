import type { Attachment } from "@/domain/models/dm"
import type { AttachmentBlobKey } from "@/domain/models/e2ee"
import { useAttachmentBlobUrl } from "@/presentation/hooks/useAttachmentBlobUrl"
import { extensionBadge, formatBytes, isImageAttachment } from "@/presentation/_libs/attachments"
import { cn } from "@/presentation/_libs/utils"

interface AttachmentFilmstripProps {
    attachments: Attachment[]
    attachmentKeys?: Record<string, AttachmentBlobKey>
    onImageClick: (attachment: Attachment) => void
}

/**
 * Horizontal-scroll row of 96×96 thumbnails. Image tiles open the lightbox on
 * click; file tiles open the blob URL in a new tab (Download is also reachable
 * from the lightbox header for images).
 *
 * After Phase 5c.4, attachment ciphertext bytes are decrypted client-side via
 * the per-attachment key + nonce sourced from the decrypted MLS application
 * body — wire-shape `Attachment` carries placeholder filename/MIME, the real
 * values live in `attachmentKeys[id]`.
 */
export function AttachmentFilmstrip({ attachments, attachmentKeys, onImageClick }: AttachmentFilmstripProps) {
    if (attachments.length === 0) return null

    return (
        <div className="mt-2 max-w-[440px]">
            <div className="flex gap-1.5 overflow-x-auto pb-1.5">
                {attachments.map((a) => {
                    const key = attachmentKeys?.[a.id]
                    // Image-vs-file decision uses the real MIME from
                    // the decrypted key when available; the wire-shape
                    // mime is "application/octet-stream" placeholder
                    // post-Phase-5c.4.
                    const realFilename = key?.original_filename ?? a.original_filename
                    const realMime = key?.mime_type ?? a.mime_type
                    const realSize = key?.byte_size ?? a.byte_size
                    return isImageAttachment({ ...a, mime_type: realMime, original_filename: realFilename })
                        ? (
                            <ImageTile
                                key={a.id}
                                attachmentId={a.id}
                                filename={realFilename}
                                attachmentKey={key}
                                onClick={() => onImageClick(a)}
                            />
                        )
                        : (
                            <FileTile
                                key={a.id}
                                attachmentId={a.id}
                                filename={realFilename}
                                byteSize={realSize}
                                attachmentKey={key}
                            />
                        )
                })}
            </div>
            <div
                className={cn(
                    "pl-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground",
                )}
            >
                {attachments.length} {attachments.length === 1 ? "file" : "files"} · scroll →
            </div>
        </div>
    )
}

function ImageTile({
    attachmentId,
    filename,
    attachmentKey,
    onClick,
}: {
    attachmentId: string
    filename: string
    attachmentKey: AttachmentBlobKey | undefined
    onClick: () => void
}) {
    const url = useAttachmentBlobUrl(attachmentId, attachmentKey)
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`Open ${filename}`}
            className={cn(
                "relative flex h-24 w-24 shrink-0 cursor-zoom-in flex-col justify-end overflow-hidden",
                "rounded-[var(--radius)] border border-border bg-muted p-0",
            )}
        >
            {url && (
                <img
                    src={url}
                    alt={filename}
                    className="absolute inset-0 h-full w-full object-cover"
                />
            )}
            <div
                className={cn(
                    "relative z-[1] truncate px-1.5 py-1 text-left",
                    "font-mono text-[9.5px] text-muted-foreground",
                )}
                style={{ background: "linear-gradient(to top, oklch(0.18 0.01 60 / 0.85), transparent)" }}
            >
                {filename}
            </div>
        </button>
    )
}

function FileTile({
    attachmentId,
    filename,
    byteSize,
    attachmentKey,
}: {
    attachmentId: string
    filename: string
    byteSize: number
    attachmentKey: AttachmentBlobKey | undefined
}) {
    const url = useAttachmentBlobUrl(attachmentId, attachmentKey)
    const ext = extensionBadge(filename)
    return (
        <a
            href={url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${filename} · ${formatBytes(byteSize)}`}
            title={`${filename} · ${formatBytes(byteSize)}`}
            className={cn(
                "relative flex h-24 w-24 shrink-0 cursor-pointer flex-col justify-end overflow-hidden",
                "rounded-[var(--radius)] border border-border bg-muted",
                !url && "pointer-events-none opacity-60",
            )}
        >
            <span
                className={cn(
                    "absolute left-2 top-2 flex h-[26px] w-[26px] items-center justify-center rounded-[5px]",
                    "border border-border-strong bg-card",
                    "font-mono text-[8.5px] font-semibold text-chat",
                )}
            >
                {ext}
            </span>
            <div
                className={cn(
                    "truncate border-t border-border px-1.5 py-1",
                    "font-mono text-[9.5px] text-muted-foreground",
                )}
            >
                {filename}
            </div>
        </a>
    )
}
