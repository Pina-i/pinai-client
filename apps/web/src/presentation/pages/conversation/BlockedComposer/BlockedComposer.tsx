import { Ban } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"

interface BlockedComposerProps {
    name: string
    isPending?: boolean
    onUnblock: () => void
}

/** Stands where the composer would: nothing can be written to someone the user blocked. */
export function BlockedComposer({ name, isPending, onUnblock }: BlockedComposerProps) {
    return (
        <div className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-[18px] border border-line2 bg-surf2 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                <Ban
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-dnd"
                />
                <span className="truncate">
                    You blocked <span className="font-medium text-foreground">{name}</span>
                </span>
            </span>
            <Button
                variant="secondary"
                size="inline"
                isDisabled={isPending}
                onPress={onUnblock}
            >
                Unblock
            </Button>
        </div>
    )
}
