import { UserMinus } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"

interface RemovedComposerProps {
    onRemoveFromList: () => void
}

/** Stands where the composer would: nothing can be written to a group the user was removed from. */
export function RemovedComposer({ onRemoveFromList }: RemovedComposerProps) {
    return (
        <div className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-[18px] border border-line2 bg-surf2 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                <UserMinus aria-hidden className="h-4 w-4 shrink-0" />
                <span className="truncate">You were removed from this group</span>
            </span>
            <Button variant="secondary" size="inline" onPress={onRemoveFromList}>
                Remove from list
            </Button>
        </div>
    )
}
