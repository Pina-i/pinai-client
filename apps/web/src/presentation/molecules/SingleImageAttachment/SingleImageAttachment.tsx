import type { Attachment } from "@pinai/domain/models/dm"
import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
import { useAttachmentBlobUrl } from "@/presentation/hooks/useAttachmentBlobUrl"
import { formatBytes } from "@/presentation/_libs/attachments"
import { cn } from "@/presentation/_libs/utils"

interface SingleImageAttachmentProps {
    attachment: Attachment
    attachmentKey: AttachmentBlobKey | undefined
    onExpand: () => void
}

/**
 * Hero treatment for messages that carry exactly one image or GIF.
 *
 * The image renders at its intrinsic dimensions (clamped by max-w / max-h)
 * so the native aspect ratio survives without any container gymnastics —
 * no `aspectRatio` style, no `object-cover` crop. Small images stay small,
 * large ones get a generous canvas up to ~960×360.
 *
 * Click anywhere → caller opens the lightbox via `onExpand`.
 */
export function SingleImageAttachment({ attachment, attachmentKey, onExpand }: SingleImageAttachmentProps) {
    const url = useAttachmentBlobUrl(attachment.id, attachmentKey)
    const filename = attachmentKey?.original_filename ?? attachment.original_filename
    const byteSize = attachmentKey?.byte_size ?? attachment.byte_size

    return (
        <button
            type="button"
            onClick={onExpand}
            aria-label={`Open ${filename} in lightbox`}
            className={cn(
                "group relative mt-2 block max-w-full cursor-zoom-in overflow-hidden",
                "rounded-[14px] border border-line bg-surf2 p-0 text-left",
            )}
        >
            {url ? (
                <img
                    src={url}
                    alt={filename}
                    className={cn(
                        "block h-auto w-auto max-w-[min(960px,100%)] max-h-[360px] object-contain",
                    )}
                />
            ) : (
                <div className="flex h-48 w-72 items-center justify-center font-mono text-[10.5px] text-muted-foreground">
                    loading…
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
