import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Button } from "@/presentation/atoms/Button/Button"
import type { BlockedPerson } from "./blocked-person.helper"

interface BlockedPersonRowProps {
    person: BlockedPerson
    isPending?: boolean
    onUnblock: (person: BlockedPerson) => void
}

export function BlockedPersonRow({ person, isPending, onUnblock }: BlockedPersonRowProps) {
    return (
        <div className="flex items-center gap-3 rounded-full px-3.5 py-2.5">
            <Avatar initials={person.name.slice(0, 2).toUpperCase()} imageUrl={person.avatarUrl} seed={person.address} size="md" />
            <span className="min-w-0 flex-1 overflow-hidden">
                <span className="title block truncate text-[15px] font-semibold text-foreground">{person.name}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">{person.address}</span>
            </span>
            <Button variant="secondary" size="inline" isDisabled={isPending} onPress={() => onUnblock(person)}>
                Unblock
            </Button>
        </div>
    )
}
