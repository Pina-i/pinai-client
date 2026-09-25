import { useState } from "react"
import { X } from "lucide-react"
import type { Attachment } from "@pinai/domain/models/dm"
import type { AttachmentBlobKey } from "@pinai/domain/models/e2ee"
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
    // Tagged with the image they were measured from: a stale entry simply
    // does not match, so the previous image's aspect ratio can never leak
    // into the next one's layout. No reset effect needed.
    const [measured, setMeasured] = useState<{ id: string; w: number; h: number } | null>(null)
    const dims = measured && measured.id === attachment?.id ? measured : null

    if (!attachment) return null

    const filename = attachmentKey?.original_filename ?? attachment.original_filename
    const byteSize = attachmentKey?.byte_size ?? attachment.byte_size
    const initials = (senderDisplayName ?? "?").slice(0, 2).toUpperCase()

    return (
        <Modal isOpen={isOpen} onClose={onClose} variant="fullscreen" overlayClassName="bg-transparent" isDismissable label="Image viewer">
            <div
                className="flex flex-1 flex-col"
                style={{ background: "color-mix(in oklab, var(--background) 82%, transparent)", backdropFilter: "blur(8px)" }}
            >
                {/* Top bar */}
                <div className="flex items-center gap-3 px-5 pb-2 pt-3.5 text-foreground">
                    <Avatar initials={initials} imageUrl={avatarUrl} seed={senderAddress} size="sm" />
                    <div className="min-w-0 flex-1">
                        <div className="title truncate text-[15px] font-semibold">{senderDisplayName ?? "—"}</div>
                        <div className="truncate font-mono text-[10px] tracking-[0.03em] text-muted-foreground">
                            {filename} · {formatBytes(byteSize)}
                            {timeLabel && ` · ${timeLabel}`}
                        </div>
                    </div>
                    <IconButton
                        isDisabled={!url}
                        onPress={() => url && downloadAttachment(url, filename)}
                        className="rounded-full border border-line2 px-3.5 py-1.5 text-[12px] text-foreground hover:bg-surf2"
                    >
                        Download
                    </IconButton>
                    <IconButton
                        onPress={onClose}
                        aria-label="Close lightbox"
                        className="h-8 w-8 rounded-full border border-line2 text-muted-foreground hover:bg-surf2 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </IconButton>
                </div>

                {/* The fullscreen Dialog covers React Aria's dismissable backdrop,
                    so clicking around the image closes it by hand. */}
                <div
                    className="flex flex-1 items-center justify-center px-8 pb-4"
                    onClick={onClose}
                >
                    {url && (
                        <img
                            src={url}
                            alt={filename}
                            onClick={(e) => e.stopPropagation()}
                            onLoad={(e) => {
                                const img = e.currentTarget
                                if (img.naturalWidth > 0) {
                                    if (attachment) {
                                        setMeasured({ id: attachment.id, w: img.naturalWidth, h: img.naturalHeight })
                                    }
                                }
                            }}
                            className={cn(
                                "max-h-full rounded-[18px] border border-line bg-surf2 object-contain",
                                "shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55)]",
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
                        "flex gap-4 px-5 pb-4 pt-2.5",
                        "font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground",
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
