import { useState } from "react"
import type { Attachment } from "@/domain/models/dm"
import type { AttachmentBlobKey } from "@/domain/models/e2ee"
import { useAttachmentBlobUrl } from "@/presentation/hooks/useAttachmentBlobUrl"
import { formatBytes } from "@/presentation/_libs/attachments"
import { cn } from "@/presentation/_libs/utils"

interface SingleImageAttachmentProps {
    attachment: Attachment
    attachmentKey: AttachmentBlobKey | undefined
    onExpand: () => void
}

/**
 * Single-image message body. Aspect ratio is preserved to whatever the bytes
 * declare; we expose `naturalWidth/Height` as soon as the `<img>` loads so the
 * container reserves the right space and avoids layout jank.
 *
 * Click anywhere → caller opens the lightbox via `onExpand`.
 */
export function SingleImageAttachment({ attachment, attachmentKey, onExpand }: SingleImageAttachmentProps) {
    const url = useAttachmentBlobUrl(attachment.id, attachmentKey)
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
    const filename = attachmentKey?.original_filename ?? attachment.original_filename
    const byteSize = attachmentKey?.byte_size ?? attachment.byte_size

    return (
        <button
            type="button"
            onClick={onExpand}
            aria-label={`Open ${filename} in lightbox`}
            className={cn(
                "mt-1.5 block w-full max-w-[560px] cursor-zoom-in overflow-hidden rounded-[var(--radius)]",
                "border border-border bg-muted text-left p-0",
            )}
            style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}
        >
            <div className="relative flex h-full w-full items-end">
                {url ? (
                    <img
                        src={url}
                        alt={filename}
                        onLoad={(e) => {
                            const img = e.currentTarget
                            if (img.naturalWidth > 0) {
                                setDims({ w: img.naturalWidth, h: img.naturalHeight })
                            }
                        }}
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center font-mono text-[10.5px] text-muted-foreground">
                        loading…
                    </div>
                )}

                {/* "Click to expand" pill */}
                <span
                    className={cn(
                        "pointer-events-none absolute right-2.5 top-2.5 rounded-md px-2 py-1",
                        "font-mono text-[9.5px] uppercase tracking-[0.06em] text-foreground",
                        "bg-[oklch(0.18_0.01_60_/_0.6)] backdrop-blur-[6px]",
                    )}
                >
                    Click to expand
                </span>

                {/* Filename + size strip */}
                <div
                    className={cn(
                        "relative z-[1] flex w-full justify-between gap-3 px-3.5 py-2.5",
                        "font-mono text-[11px] text-muted-foreground",
                    )}
                    style={{ background: "linear-gradient(to top, oklch(0.18 0.01 60 / 0.85), transparent)" }}
                >
                    <span className="truncate">{filename}</span>
                    <span className="shrink-0">{formatBytes(byteSize)}</span>
                </div>
            </div>
        </button>
    )
}
