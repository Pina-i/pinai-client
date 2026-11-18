import { Lock, ShieldCheck } from "lucide-react"
import type { Person } from "@pinai/domain/models/people-search"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Skeleton } from "@/presentation/atoms/Skeleton/Skeleton"
import { Spinner } from "@/presentation/atoms/Spinner/Spinner"
import type { AddressView } from "../AddFriendPopover.viewmodel"
import { PersonAction, StatusChip } from "../PersonAction/PersonAction"
import { SearchNote } from "../SearchNote/SearchNote"

interface AddressResultProps {
    view: AddressView
    onAdd: (person: Person) => void
    onAccept: (person: Person) => void
}

/** "Everywhere else": an exact address looked up on its own instance. */
export function AddressResult({ view, onAdd, onAccept }: AddressResultProps) {
    switch (view.kind) {
        case "idle":
            return (
                <SearchNote icon={<Lock className="h-[15px] w-[15px]" />}>
                    Pīna'i never lists strangers from other servers. Paste the address they gave you —{" "}
                    <span className="font-mono text-foreground">name_ab3xz@server</span>.
                </SearchNote>
            )
        case "incomplete":
            return (
                <SearchNote>
                    Keep going — add their server after the @, like <b>@moana.social</b>.
                </SearchNote>
            )
        case "loading":
            return (
                <div className="flex items-center gap-3 rounded-[16px] border border-line p-3">
                    <Skeleton shape="circle" className="h-11 w-11" />
                    <span className="flex flex-1 flex-col gap-[7px]">
                        <Skeleton className="h-[13px] w-[40%]" />
                        <span className="flex items-center gap-[7px] font-mono text-[10.5px] tracking-[.03em] text-muted-ink">
                            <Spinner size="sm" />
                            asking {view.domain}…
                        </span>
                    </span>
                </div>
            )
        case "found": {
            const { person } = view
            return (
                <div className="flex items-center gap-3 rounded-[16px] border border-acc-line bg-acc-soft px-3.5 py-3">
                    <Avatar
                        initials={person.initials}
                        imageUrl={person.person.avatar_url}
                        seed={person.person.address}
                        size="md"
                    />
                    <span className="min-w-0 flex-1">
                        <span className="title block truncate text-[18px] font-semibold text-foreground">{person.name}</span>
                        <span className="flex items-center gap-[5px] font-mono text-[10.5px] tracking-[.03em] text-muted-ink">
                            <ShieldCheck className="h-[11px] w-[11px] shrink-0" />
                            found on {view.domain}
                        </span>
                    </span>
                    {view.isSelf ? (
                        <StatusChip>That's you</StatusChip>
                    ) : (
                        <PersonAction
                            shown={person.shown}
                            name={person.name}
                            prominent
                            onAdd={() => onAdd(person.person)}
                            onAccept={() => onAccept(person.person)}
                        />
                    )}
                </div>
            )
        }
        case "not-found":
            return (
                <SearchNote tone="error">
                    <b>No account at this address on {view.domain}.</b> Check the five characters after the underscore —
                    addresses have to be exact.
                </SearchNote>
            )
        case "unreachable":
            return (
                <SearchNote tone="error">
                    <b>Couldn't reach {view.domain}.</b> The server may be down, or the address mistyped. Try again in a
                    moment.
                </SearchNote>
            )
        case "failed":
            return <SearchNote tone="error">Couldn't search right now.</SearchNote>
    }
}
