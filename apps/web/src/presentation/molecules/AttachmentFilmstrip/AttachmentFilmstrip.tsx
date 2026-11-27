import { useState } from "react"
import type { Attachment } from "@pinai/domain/models/dm"
import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { imagePreviewOf, isImageAttachment } from "@pinai/domain/models/image-preview"
import { useAttachmentBlobUrl } from "@/presentation/hooks/useAttachmentBlobUrl"
import { extensionBadge, formatBytes } from "@/presentation/_libs/attachments"
import { blurhashImage } from "@/presentation/_libs/blurhash-image"
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
                    const realFilename = key?.original_filename ?? a.original_filename
                    const realSize = key?.byte_size ?? a.byte_size
                    return isImageAttachment(a, key)
                        ? (
                            <ImageTile
                                key={a.id}
                                filename={realFilename}
                                attachmentKey={key}
                                onClick={() => onImageClick(a)}
                            />
                        )
                        : (
                            <FileTile
                                key={a.id}
                                filename={realFilename}
                                byteSize={realSize}
                                attachmentKey={key}
                            />
                        )
                })}
            </div>
            <p className="fact pl-0.5">
                {attachments.length} {attachments.length === 1 ? "file" : "files"} · scroll →
            </p>
        </div>
    )
}

function ImageTile({
    filename,
    attachmentKey,
    onClick,
}: {
    filename: string
    attachmentKey: AttachmentBlobKey | undefined
    onClick: () => void
}) {
    const { url } = useAttachmentBlobUrl(attachmentKey)
    const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
    const isShown = url !== null && loadedUrl === url
    const blurhash = imagePreviewOf(attachmentKey)?.blurhash
    const placeholder = blurhash ? blurhashImage(blurhash) : null
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`Open ${filename}`}
            className="relative flex h-24 w-24 shrink-0 cursor-zoom-in flex-col justify-end overflow-hidden rounded-[14px] border border-line bg-surf2 p-0"
        >
            {placeholder && (
                <img
                    src={placeholder}
                    alt=""
                    aria-hidden
                    className={cn(
                        "absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-out motion-reduce:transition-none",
                        isShown && "opacity-0",
                    )}
                />
            )}
            {url && (
                <img
                    src={url}
                    alt={filename}
                    onLoad={() => setLoadedUrl(url)}
                    className={cn(
                        "absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-out motion-reduce:transition-none",
                        !isShown && "opacity-0",
                    )}
                />
            )}
            <div
                className={cn(
                    "relative z-[1] truncate px-1.5 py-1 text-left",
                    "font-mono text-[9.5px] text-muted-foreground",
                )}
                style={{ background: "linear-gradient(to top, color-mix(in oklab, var(--background) 85%, transparent), transparent)" }}
            >
                {filename}
            </div>
        </button>
    )
}

function FileTile({
    filename,
    byteSize,
    attachmentKey,
}: {
    filename: string
    byteSize: number
    attachmentKey: AttachmentBlobKey | undefined
}) {
    const { url } = useAttachmentBlobUrl(attachmentKey)
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
                "rounded-[14px] border border-line bg-surf2",
                !url && "pointer-events-none opacity-60",
            )}
        >
            <span
                className={cn(
                    "absolute left-2 top-2 flex h-[26px] w-[26px] items-center justify-center rounded-[8px]",
                    "bg-surf3 font-mono text-[8.5px] font-bold text-acc",
                )}
            >
                {ext}
            </span>
            <div
                className={cn(
                    "truncate border-t border-line px-1.5 py-1",
                    "font-mono text-[9.5px] text-muted-foreground",
                )}
            >
                {filename}
            </div>
        </a>
    )
}
