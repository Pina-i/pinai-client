import { X } from "lucide-react"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { extensionBadge, formatBytes } from "@/presentation/_libs/attachments"
import { cn } from "@/presentation/_libs/utils"
import type { PendingAttachment } from "./MessageInput.viewmodel"

interface ComposerUploadRowProps {
    pending: PendingAttachment
    onRemove: () => void
}

/**
 * One row per in-flight upload. Shows the extension badge, filename,
 * "{pct}% · {size}" or "{size} · done", a thin progress bar, and an × to
 * cancel. The bar turns to the online green on completion.
 */
export function ComposerUploadRow({ pending, onRemove }: ComposerUploadRowProps) {
    const ext = extensionBadge(pending.file.name)
    const sizeLabel = formatBytes(pending.file.size)
    const pct = Math.round(pending.progress * 100)
    const isDone = !!pending.attachment
    const hasError = !!pending.error

    const rightLabel = hasError
        ? pending.error
        : isDone
          ? `${sizeLabel} · done`
          : `${pct}% · ${sizeLabel}`

    return (
        <div className="flex items-center gap-2.5 rounded-[12px] border border-line bg-surf2 px-2.5 py-1.5">
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-surf3 font-mono text-[8.5px] font-bold text-acc">
                {ext}
            </span>

            <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline gap-2">
                    <span className="flex-1 truncate text-[11.5px] font-medium text-foreground">
                        {pending.file.name}
                    </span>
                    <span
                        className={cn(
                            "shrink-0 font-mono text-[9.5px] tracking-[0.04em]",
                            hasError ? "text-dnd" : "text-muted-foreground",
                        )}
                    >
                        {rightLabel}
                    </span>
                </div>
                <div className="h-[3px] overflow-hidden rounded-full bg-surf3">
                    <div
                        className={cn(
                            "h-full rounded-full transition-[width] duration-200",
                            hasError ? "bg-dnd" : isDone ? "bg-on" : "bg-acc",
                        )}
                        style={{ width: `${hasError ? 100 : pct}%` }}
                    />
                </div>
            </div>

            <IconButton variant="ghost" aria-label={`Remove ${pending.file.name}`} onPress={onRemove} className="h-6 w-6">
                <X className="h-3.5 w-3.5" />
            </IconButton>
        </div>
    )
}
