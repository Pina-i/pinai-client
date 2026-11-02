import { Header, ListBox, ListBoxSection } from "react-aria-components"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import type { ResultGroup } from "../ConversationSearch.viewmodel"
import { SearchResultRow } from "./SearchResultRow/SearchResultRow"

interface SearchResultsProps {
    query: string
    groups: ResultGroup[]
    count: number
}

export function SearchResults({ query, groups, count }: SearchResultsProps) {
    return (
        <ScrollArea className="relative flex-1 px-2.5 py-0.5">
            <div className="flex items-center justify-between pl-2 pr-1.5 pt-1">
                <span className="fact">
                    {count} {count === 1 ? "result" : "results"}
                </span>
                <span className="fact fact-plain">esc to clear</span>
            </div>
            <ListBox
                aria-label="Search results"
                shouldFocusOnHover
                className="outline-none"
                renderEmptyState={() => (
                    <p className="mx-2 mb-2.5 mt-[18px] text-[12.5px] leading-normal text-muted-foreground">
                        Nothing here matches “<b className="text-foreground">{query.trim()}</b>”. To reach someone new,
                        add them as a friend.
                    </p>
                )}
            >
                {groups.map((group) => (
                    <ListBoxSection key={group.id} id={group.id} className="mb-2.5">
                        <Header className="eye mb-[5px] ml-2 mr-1 mt-3">
                            {group.label} <span className="fact ml-[3px]">{group.rows.length}</span>
                        </Header>
                        {group.rows.map((row) => (
                            <SearchResultRow key={row.id} row={row} />
                        ))}
                    </ListBoxSection>
                ))}
            </ListBox>
        </ScrollArea>
    )
}
