import { useEffect, useState } from "react"
import { X } from "lucide-react"
import type { Attachment } from "@/domain/models/dm"
import type { AttachmentBlobKey } from "@/domain/models/e2ee"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { useAppStore } from "@/store/store"
import { useAttachmentBlobUrl } from "@/presentation/hooks/useAttachmentBlobUrl"
import { downloadAttachment, formatBytes } from "@/presentation/_libs/attachments"
import { cn } from "@/presentation/_libs/utils"

interface ImageLightboxDialogProps {
    isOpen: boolean
    onClose: () => void
    attachment: Attachment | null
    attachmentKey?: AttachmentBlobKey
    senderAddress?: string
    senderDisplayName?: string
    timeLabel?: string
}

/**
 * Full-viewport lightbox for a single image attachment. Click backdrop to
 * close, Esc to close, Download button to save the file. The Modal molecule
 * provides the focus-trap and Esc handling — we layer the chrome inside.
 */
export function ImageLightboxDialog({
    isOpen,
    onClose,
    attachment,
    attachmentKey,
    senderAddress,
    senderDisplayName,
    timeLabel,
}: ImageLightboxDialogProps) {
    const url = useAttachmentBlobUrl(attachment?.id, attachmentKey)
    const avatarUrl = useAppStore((s) =>
        senderAddress ? s.avatarsByAddress[senderAddress] ?? null : null,
    )
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

    // Reset dims when the active image changes — otherwise the previous
    // image's aspect ratio leaks into the next one's layout for a frame.
    useEffect(() => {
        setDims(null)
    }, [attachment?.id])

    if (!attachment) return null

    const filename = attachmentKey?.original_filename ?? attachment.original_filename
    const byteSize = attachmentKey?.byte_size ?? attachment.byte_size
    const initials = (senderDisplayName ?? "?").slice(0, 2).toUpperCase()

    return (
        <Modal isOpen={isOpen} onClose={onClose} variant="fullscreen" isDismissable>
            <div
                className="flex flex-1 flex-col"
                style={{ background: "oklch(0.10 0.005 60 / 0.82)", backdropFilter: "blur(8px)" }}
            >
                {/* Top bar */}
                <div className="flex items-center gap-3.5 px-5 pt-3.5 pb-2 text-foreground">
                    <Avatar initials={initials} imageUrl={avatarUrl} color="var(--chat)" size="xs" />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium">{senderDisplayName ?? "—"}</div>
                        <div className="truncate font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground">
                            {filename} · {formatBytes(byteSize)}
                            {timeLabel && ` · ${timeLabel}`}
                        </div>
                    </div>
                    <IconButton
                        isDisabled={!url}
                        onPress={() => url && downloadAttachment(url, filename)}
                        className={cn(
                            "rounded-md border border-border-strong px-3 py-1.5",
                            "font-mono text-[10.5px] uppercase tracking-[0.06em] text-foreground",
                            "hover:bg-accent/40",
                        )}
                    >
                        Download
                    </IconButton>
                    <IconButton
                        onPress={onClose}
                        aria-label="Close lightbox"
                        className={cn(
                            "h-8 w-8 rounded-[var(--radius-sm)] border border-border-strong",
                            "text-foreground hover:bg-accent/40",
                        )}
                    >
                        <X className="h-4 w-4" />
                    </IconButton>
                </div>

                {/* Image stage */}
                <div
                    className="flex flex-1 items-center justify-center px-8 pb-4"
                    onClick={(e) => e.stopPropagation()}
                >
                    {url && (
                        <img
                            src={url}
                            alt={filename}
                            onLoad={(e) => {
                                const img = e.currentTarget
                                if (img.naturalWidth > 0) {
                                    setDims({ w: img.naturalWidth, h: img.naturalHeight })
                                }
                            }}
                            className={cn(
                                "max-h-full rounded-[var(--radius-lg)] border border-border bg-muted object-contain",
                                "shadow-[0_24px_60px_oklch(0.05_0.005_60_/_0.5)]",
                            )}
                            style={{
                                width: "100%",
                                maxWidth: "min(96%, 1080px)",
                                aspectRatio: dims ? `${dims.w} / ${dims.h}` : undefined,
                            }}
                        />
                    )}
                </div>

                {/* Footnote */}
                <div
                    className={cn(
                        "flex gap-4.5 px-5 pb-4 pt-2.5",
                        "font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
                    )}
                >
                    <span>esc · close</span>
                    <span>↓ · save</span>
                    <span className="ml-auto">1 of 1</span>
                </div>
            </div>
        </Modal>
    )
}
