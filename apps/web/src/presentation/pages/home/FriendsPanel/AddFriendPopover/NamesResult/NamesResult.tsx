import type { Person } from "@pinai/domain/models/people-search"
import type { NamesView } from "../AddFriendPopover.viewmodel"
import { PersonRow, PersonRowSkeleton } from "../PersonRow/PersonRow"
import { SearchNote } from "../SearchNote/SearchNote"

interface NamesResultProps {
    view: NamesView
    section: "server" | "groups"
    /** The user's instance, as the server section names it. */
    domain: string
    onAdd: (person: Person) => void
    onAccept: (person: Person) => void
}

/** A section searched by name: its rows, or why there are none. */
export function NamesResult({ view, section, domain, onAdd, onAccept }: NamesResultProps) {
    switch (view.kind) {
        case "paused":
            return (
                <p className="m-0 px-0.5 py-1 font-mono text-[10.5px] tracking-[.03em] text-muted-ink">
                    Paused — you're typing an address.
                </p>
            )
        case "loading":
            return (
                <div aria-hidden>
                    <PersonRowSkeleton />
                    <PersonRowSkeleton wide />
                </div>
            )
        case "failed":
            return <SearchNote tone="error">Couldn't search right now.</SearchNote>
        case "found": {
            const rows = view[section]
            if (rows.length === 0) {
                return section === "server" ? (
                    <SearchNote>
                        No one on {domain} matches “<b>{view.query}</b>”. Try fewer letters — names are matched without
                        accents.
                    </SearchNote>
                ) : (
                    <SearchNote>
                        No one in your groups matches “<b>{view.query}</b>”.
                    </SearchNote>
                )
            }
            return (
                <ul className="m-0 list-none p-0">
                    {rows.map((row) => (
                        <PersonRow
                            key={row.person.actor_uri}
                            view={row}
                            showTags={section === "groups"}
                            onAdd={onAdd}
                            onAccept={onAccept}
                        />
                    ))}
                </ul>
            )
        }
    }
}
