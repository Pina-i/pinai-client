import type { Attachment } from "@/domain/models/dm"
import { useAttachmentBlobUrl } from "@/presentation/hooks/useAttachmentBlobUrl"
import { extensionBadge, formatBytes, isImageAttachment } from "@/presentation/_libs/attachments"
import { cn } from "@/presentation/_libs/utils"

interface AttachmentFilmstripProps {
    attachments: Attachment[]
    onImageClick: (attachment: Attachment) => void
}

/**
 * Horizontal-scroll row of 96×96 thumbnails. Image tiles open the lightbox on
 * click; file tiles open the blob URL in a new tab (Download is also reachable
 * from the lightbox header for images).
 */
export function AttachmentFilmstrip({ attachments, onImageClick }: AttachmentFilmstripProps) {
    if (attachments.length === 0) return null

    return (
        <div className="mt-2 max-w-[440px]">
            <div className="flex gap-1.5 overflow-x-auto pb-1.5">
                {attachments.map((a) =>
                    isImageAttachment(a) ? (
                        <ImageTile key={a.id} attachment={a} onClick={() => onImageClick(a)} />
                    ) : (
                        <FileTile key={a.id} attachment={a} />
                    ),
                )}
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

function ImageTile({ attachment, onClick }: { attachment: Attachment; onClick: () => void }) {
    const url = useAttachmentBlobUrl(attachment.id)
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`Open ${attachment.original_filename}`}
            className={cn(
                "relative flex h-24 w-24 shrink-0 cursor-zoom-in flex-col justify-end overflow-hidden",
                "rounded-[var(--radius)] border border-border bg-muted p-0",
            )}
        >
            {url && (
                <img
                    src={url}
                    alt={attachment.original_filename}
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
                {attachment.original_filename}
            </div>
        </button>
    )
}

function FileTile({ attachment }: { attachment: Attachment }) {
    const url = useAttachmentBlobUrl(attachment.id)
    const ext = extensionBadge(attachment.original_filename)
    return (
        <a
            href={url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${attachment.original_filename} · ${formatBytes(attachment.byte_size)}`}
            title={`${attachment.original_filename} · ${formatBytes(attachment.byte_size)}`}
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
                {attachment.original_filename}
            </div>
        </a>
    )
}
