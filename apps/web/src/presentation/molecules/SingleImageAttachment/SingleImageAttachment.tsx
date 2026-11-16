import { useState } from "react"
import type { Attachment } from "@pinai/domain/models/dm"
import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { imagePreviewOf } from "@pinai/domain/models/image-preview"
import { Skeleton } from "@/presentation/atoms/Skeleton/Skeleton"
import { useAttachmentBlobUrl } from "@/presentation/hooks/useAttachmentBlobUrl"
import { formatBytes } from "@/presentation/_libs/attachments"
import { blurhashImage } from "@/presentation/_libs/blurhash-image"
import { cn } from "@/presentation/_libs/utils"

interface SingleImageAttachmentProps {
    attachment: Attachment
    attachmentKey: AttachmentBlobKey | undefined
    onExpand: () => void
}

const MAX_WIDTH = 960
const MAX_HEIGHT = 360
// An image sent without its size gets a fixed frame, so its arrival moves nothing.
const FRAME = { width: 320, height: 240 }

/**
 * Hero treatment for messages that carry exactly one image or GIF.
 *
 * Its box is laid out before it loads, from the size its message carried, at the image's own
 * aspect ratio — small images stay small, large ones get up to ~960×360. The blurhash shows
 * meanwhile, and the image fades in over it.
 *
 * Click anywhere → caller opens the lightbox via `onExpand`.
 */
export function SingleImageAttachment({ attachment, attachmentKey, onExpand }: SingleImageAttachmentProps) {
    const { url, failed } = useAttachmentBlobUrl(attachmentKey)
    const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
    const isShown = url !== null && loadedUrl === url
    const preview = imagePreviewOf(attachmentKey)
    const box = preview ?? FRAME
    const placeholder = preview?.blurhash ? blurhashImage(preview.blurhash) : null
    const filename = attachmentKey?.original_filename ?? attachment.original_filename
    const byteSize = attachmentKey?.byte_size ?? attachment.byte_size

    return (
        <button
            type="button"
            onClick={onExpand}
            aria-label={`Open ${filename} in lightbox`}
            style={{
                aspectRatio: `${box.width} / ${box.height}`,
                width: `min(${box.width}px, ${MAX_WIDTH}px, 100%, ${(MAX_HEIGHT * box.width) / box.height}px)`,
            }}
            className={cn(
                "group relative mt-2 block max-w-full cursor-zoom-in overflow-hidden",
                "rounded-[14px] border border-line bg-surf2 p-0 text-left",
            )}
        >
            {placeholder ? (
                <img
                    src={placeholder}
                    alt=""
                    aria-hidden
                    className={cn(
                        "absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-out motion-reduce:transition-none",
                        isShown && "opacity-0",
                    )}
                />
            ) : (
                !isShown && !failed && <Skeleton shape="block" className="absolute inset-0 h-full w-full rounded-none" />
            )}

            {url && (
                <img
                    src={url}
                    alt={filename}
                    onLoad={() => setLoadedUrl(url)}
                    className={cn(
                        "absolute inset-0 h-full w-full transition-opacity duration-200 ease-out motion-reduce:transition-none",
                        preview ? "object-cover" : "object-contain",
                        !isShown && "opacity-0",
                    )}
                />
            )}

            {failed && (
                <div className="absolute inset-0 flex items-center justify-center px-3 text-center font-mono text-[10.5px] text-muted-foreground">
                    This image couldn't be loaded
                </div>
            )}

            <span
                className={cn(
                    "pointer-events-none absolute right-2.5 top-2.5 rounded-full px-2.5 py-1",
                    "font-mono text-[9.5px] uppercase tracking-[0.06em] text-foreground",
                    "bg-[color-mix(in_oklab,var(--background)_60%,transparent)] backdrop-blur-[6px]",
                    "opacity-0 transition-opacity group-hover:opacity-100",
                )}
            >
                Click to expand
            </span>

            <div
                className={cn(
                    "absolute inset-x-0 bottom-0 flex w-full justify-between gap-3 px-3.5 py-2.5",
                    "font-mono text-[10.5px] text-muted-foreground",
                    "opacity-0 transition-opacity group-hover:opacity-100",
                )}
                style={{ background: "linear-gradient(to top, color-mix(in oklab, var(--background) 85%, transparent), transparent)" }}
            >
                <span className="truncate">{filename}</span>
                <span className="shrink-0">{formatBytes(byteSize)}</span>
            </div>
        </button>
    )
}
