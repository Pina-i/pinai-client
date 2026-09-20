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
 * cancel. The bar turns success-green on completion.
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
        <div
            className={cn(
                "flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-muted px-2.5 py-1.5",
            )}
        >
            <span
                className={cn(
                    "flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-[5px]",
                    "h-[26px] w-[26px] border border-border-strong bg-card",
                    "font-mono text-[8.5px] font-semibold text-chat",
                )}
            >
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
                            hasError ? "text-destructive" : "text-muted-foreground",
                        )}
                    >
                        {rightLabel}
                    </span>
                </div>
                <div
                    className="h-[3px] overflow-hidden rounded-[3px]"
                    style={{ background: "color-mix(in oklab, var(--foreground) 8%, transparent)" }}
                >
                    <div
                        className={cn("h-full transition-[width] duration-200", hasError ? "bg-destructive" : isDone ? "bg-success" : "bg-chat")}
                        style={{ width: `${hasError ? 100 : pct}%` }}
                    />
                </div>
            </div>

            <IconButton
                aria-label={`Remove ${pending.file.name}`}
                onPress={onRemove}
                className="h-[22px] w-[22px] rounded-[4px] text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            >
                <X className="h-3.5 w-3.5" />
            </IconButton>
        </div>
    )
}
