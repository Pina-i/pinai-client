import { Globe, Users } from "lucide-react"
import type { Person } from "@pinai/domain/models/people-search"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Highlight } from "@/presentation/atoms/Highlight/Highlight"
import { Skeleton } from "@/presentation/atoms/Skeleton/Skeleton"
import type { PersonView } from "../AddFriendPopover.viewmodel"
import { PersonAction } from "../PersonAction/PersonAction"
import { Tag } from "../Tag/Tag"

interface PersonRowProps {
    view: PersonView
    /** The group the two share and their instance, for the people of the user's groups. */
    showTags?: boolean
    onAdd: (person: Person) => void
    onAccept: (person: Person) => void
}

export function PersonRow({ view, showTags = false, onAdd, onAccept }: PersonRowProps) {
    return (
        <li className="flex items-center gap-3 rounded-[14px] px-2.5 py-2 hover:bg-surf2">
            <Avatar initials={view.initials} imageUrl={view.person.avatar_url} seed={view.person.address} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="title truncate text-[15px] font-semibold text-foreground">
                    <Highlight text={view.name} match={view.match} />
                </span>
                {showTags && (
                    <span className="mt-[3px] flex min-w-0 gap-1">
                        {view.group !== null && <Tag icon={<Users />}>{view.group}</Tag>}
                        <Tag icon={<Globe />}>{view.host}</Tag>
                    </span>
                )}
            </span>
            <PersonAction
                shown={view.shown}
                name={view.name}
                onAdd={() => onAdd(view.person)}
                onAccept={() => onAccept(view.person)}
            />
        </li>
    )
}

export function PersonRowSkeleton({ wide = false }: { wide?: boolean }) {
    return (
        <div className="flex items-center gap-3 px-2.5 py-2">
            <Skeleton shape="circle" className="h-[30px] w-[30px]" />
            <span className="flex flex-1 flex-col gap-1.5">
                <Skeleton className={wide ? "h-[11px] w-[62%]" : "h-[11px] w-[46%]"} />
                <Skeleton className={wide ? "h-2 w-[22%]" : "h-2 w-[30%]"} />
            </span>
            <Skeleton shape="circle" className="h-[26px] w-[58px]" />
        </div>
    )
}
