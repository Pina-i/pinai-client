import { Check, GitBranch, Globe, Search, X } from "lucide-react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Button } from "@/presentation/atoms/Button/Button"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { cn } from "@/presentation/_libs/utils"
import { useAppStore } from "@/store/store"
import type { GroupComposerState } from "@/store/slices/ui.slice"
import type { Friend } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"
import { useGroupComposerViewModel } from "./GroupComposer.viewmodel"

/** Mounts the content only while open so the viewmodel always has a composer. */
export function GroupComposer() {
    const composer = useAppStore((s) => s.groupComposer)
    const closeGroupComposer = useAppStore((s) => s.closeGroupComposer)

    return (
        <Modal
            isOpen={composer !== null}
            onClose={closeGroupComposer}
            label={composer?.mode === "add" ? "Add people" : "New group"}
        >
            {composer && <GroupComposerContent composer={composer} onClose={closeGroupComposer} />}
        </Modal>
    )
}

function GroupComposerContent({
    composer,
    onClose,
}: {
    composer: GroupComposerState
    onClose: () => void
}) {
    const vm = useGroupComposerViewModel(composer, onClose)

    return (
        <div className="flex max-h-[80vh] w-[560px] max-w-[92vw] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-popover shadow-xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border px-6 pb-4 pt-5">
                <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {vm.isAddMode ? "Add to group" : "New group"}
                    </p>
                    <h2 className="title mt-1 text-xl font-medium text-foreground">
                        {vm.isAddMode ? "Add people" : "Who's in?"}
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Fork explainer — adding to a 1:1 starts a brand-new group */}
            {vm.isFork && (
                <div className="flex items-start gap-3 border-b border-border bg-chat/10 px-6 py-3.5">
                    <span className="mt-0.5 text-chat">
                        <GitBranch className="h-4 w-4" />
                    </span>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        This starts a <span className="font-medium text-foreground">new group</span>. Your private
                        one-to-one conversation stays exactly as it is.
                    </p>
                </div>
            )}

            {/* Search */}
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                    value={vm.query}
                    onChange={(e) => vm.setQuery(e.target.value)}
                    placeholder="Search friends"
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
            </div>

            {/* Friend list */}
            <ScrollArea className="min-h-[160px] flex-1 px-2 py-2">
                {vm.isLoading && (
                    <p className="py-8 text-center text-sm text-muted-foreground">Loading friends…</p>
                )}
                {!vm.isLoading && vm.friends.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">No friends found.</p>
                )}
                {vm.friends.map((friend) => (
                    <ComposerFriendRow
                        key={friend.id}
                        friend={friend}
                        selected={vm.selectedIds.has(friend.id)}
                        disabled={vm.excludedIds.has(friend.id)}
                        onToggle={() => vm.toggle(friend)}
                    />
                ))}
            </ScrollArea>

            {/* Optional name (create only) */}
            {!vm.isAddMode && (
                <div className="border-t border-border px-6 py-4">
                    <div className="mb-2 flex items-baseline justify-between">
                        <label htmlFor="group-name" className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            Group name
                        </label>
                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                            Optional
                        </span>
                    </div>
                    <input
                        id="group-name"
                        value={vm.name}
                        onChange={(e) => vm.setName(e.target.value)}
                        placeholder="Leave blank to use members' names"
                        className="h-10 w-full border border-border-strong bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring"
                    />
                </div>
            )}

            {/* Footer */}
            <div className="border-t border-border px-6 py-4">
                {vm.error && <p className="mb-3 text-xs text-destructive">{vm.error}</p>}
                {vm.hasFederatedSelection && (
                    <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Globe className="h-3.5 w-3.5" />
                        <span>Some members are on other servers — they'll join over federation.</span>
                    </div>
                )}
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                        {vm.selectedFriends.length} selected
                    </span>
                    <div className="flex gap-2">
                        <Button variant="secondary" onPress={onClose} className="w-auto px-4">
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onPress={vm.submit}
                            isDisabled={!vm.canSubmit}
                            className="w-auto px-5"
                        >
                            {vm.isSubmitting
                                ? "Working…"
                                : vm.isAddMode
                                  ? `Add ${vm.selectedFriends.length || ""} ${vm.selectedFriends.length === 1 ? "person" : "people"}`.trim()
                                  : "Create group"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function ComposerFriendRow({
    friend,
    selected,
    disabled,
    onToggle,
}: {
    friend: Friend
    selected: boolean
    disabled: boolean
    onToggle: () => void
}) {
    const initials = friend.name
        .split(" ")
        .map((n) => n[0])
        .join("")

    return (
        <button
            onClick={onToggle}
            disabled={disabled}
            className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                disabled ? "cursor-default opacity-55" : "cursor-pointer hover:bg-accent",
                selected && !disabled && "bg-accent/60",
            )}
        >
            <Avatar initials={initials} imageUrl={friend.avatarUrl} size="sm" status={friend.status} />
            <div className="min-w-0 flex-1">
                <p className="title truncate text-sm font-medium text-foreground">{friend.name}</p>
                <p className="truncate font-mono text-[10.5px] text-muted-foreground">{friend.address}</p>
            </div>
            {disabled ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                    in group
                </span>
            ) : (
                <span
                    className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
                    )}
                >
                    {selected && <Check className="h-3 w-3" />}
                </span>
            )}
        </button>
    )
}
