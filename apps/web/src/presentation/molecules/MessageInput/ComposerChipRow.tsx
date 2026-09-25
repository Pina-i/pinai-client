import { X } from "lucide-react"
import { extensionBadge } from "@/presentation/_libs/attachments"
import type { PendingAttachment } from "./MessageInput.viewmodel"

interface ComposerChipRowProps {
    pending: PendingAttachment
    onRemove: () => void
}

/**
 * Compact pill chip for an already-uploaded attachment that's ready to send.
 * Only the extension + filename are shown — no thumbnails — to keep the
 * composer height small even with five files.
 */
export function ComposerChipRow({ pending, onRemove }: ComposerChipRowProps) {
    const ext = extensionBadge(pending.file.name)
    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surf2 py-1 pl-2.5 pr-1 text-[11.5px] text-foreground">
            <span className="font-mono text-[9px] font-bold tracking-[0.06em] text-acc">{ext}</span>
            <span className="max-w-[160px] truncate">{pending.file.name}</span>
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${pending.file.name}`}
                className="flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-surf3 text-muted-foreground hover:text-foreground"
            >
                <X className="h-2.5 w-2.5" />
            </button>
        </span>
    )
}
