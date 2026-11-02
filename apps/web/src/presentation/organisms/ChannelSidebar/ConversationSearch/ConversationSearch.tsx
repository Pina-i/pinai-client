import type { ReactNode } from "react"
import { Autocomplete } from "react-aria-components"
import { SearchField } from "@/presentation/atoms/SearchField/SearchField"
import { modShortcutLabel } from "@/presentation/_libs/shortcut-key"
import { useConversationSearchViewModel } from "./ConversationSearch.viewmodel"
import { SearchResults } from "./SearchResults/SearchResults"

interface ConversationSearchProps {
    /** The ⌘K shortcut asks for the field. */
    focusPending: boolean
    onFocused: () => void
    children: ReactNode
}

/** The DM sidebar's search field: while it holds a query, its results take the place of `children`. */
export function ConversationSearch({ focusPending, onFocused, children }: ConversationSearchProps) {
    const { query, setQuery, inputRef, searching, groups, count, onFieldKeyDown } = useConversationSearchViewModel(
        focusPending,
        onFocused,
    )

    return (
        <>
            <Autocomplete inputValue={query} onInputChange={setQuery}>
                <div className="relative p-3">
                    <SearchField
                        aria-label="Find or start a conversation"
                        placeholder="Find or start a conversation"
                        shortcutHint={searching ? "esc" : modShortcutLabel("k")}
                        onKeyDown={onFieldKeyDown}
                        inputRef={inputRef}
                    />
                </div>
                {searching && <SearchResults query={query} groups={groups} count={count} />}
            </Autocomplete>
            {/* Outside the Autocomplete: it would take over the list's own menus as its collection. */}
            {!searching && children}
        </>
    )
}
