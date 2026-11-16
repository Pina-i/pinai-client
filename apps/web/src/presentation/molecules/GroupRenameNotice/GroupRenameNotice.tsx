import { Pencil } from "lucide-react"

interface GroupRenameNoticeProps {
    /** "You", or whoever renamed it. */
    by: string
    name: string
    /** Pre-formatted "HH:MM". */
    timestamp: string
}

/** A rename, set apart from the group's other changes: the title everyone sees just changed. */
export function GroupRenameNotice({ by, name, timestamp }: GroupRenameNoticeProps) {
    return (
        <div className="mb-1 mt-2.5 flex items-center gap-2.5 rounded-[14px] bg-acc-soft/55 px-3.5 py-[9px] text-[13px] text-muted-foreground">
            <Pencil aria-hidden className="h-3.5 w-3.5 shrink-0 text-acc" />
            <span className="min-w-0 flex-1 break-words">
                <b className="font-medium text-foreground">{by}</b> renamed the group to{" "}
                <b className="font-medium text-foreground">{name}</b>
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{timestamp}</span>
        </div>
    )
}
