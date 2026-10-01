import { Check, GitBranch, Globe, Search, X } from "lucide-react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Button } from "@/presentation/atoms/Button/Button"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
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
        <div className={cn(modalSurface, "max-h-[80vh] w-[560px]")}>
            <div className="flex items-start justify-between gap-3 border-b border-line px-6 pb-4 pt-5">
                <div>
                    <p className="eye">{vm.isAddMode ? "Add to group" : "New group"}</p>
                    <h2 className="title mt-1 text-[24px] font-normal tracking-[-0.01em] text-foreground">
                        {vm.isAddMode ? "Add people" : "Who's in?"}
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line2 text-muted-foreground transition-colors duration-150 hover:bg-surf2 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {vm.isFork && (
                <div className="flex items-start gap-3 border-b border-line bg-[color-mix(in_oklab,var(--acc)_9%,transparent)] px-6 py-3.5">
                    <span className="mt-0.5 text-acc">
                        <GitBranch className="h-4 w-4" />
                    </span>
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                        This starts a <span className="font-medium text-foreground">new group</span>. Your private
                        one-to-one conversation stays exactly as it is.
                    </p>
                </div>
            )}

            <div className="flex items-center gap-2.5 border-b border-line px-5 py-3 text-muted-foreground">
                <Search className="h-4 w-4 shrink-0" />
                <input
                    value={vm.query}
                    onChange={(e) => vm.setQuery(e.target.value)}
                    placeholder="Search friends"
                    className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground outline-none"
                />
            </div>

            <ScrollArea className="min-h-[160px] flex-1 p-2">
                {vm.isLoading && (
                    <p className="title py-8 text-center text-[13px] italic text-muted-foreground">Loading friends…</p>
                )}
                {!vm.isLoading && vm.friends.length === 0 && (
                    <p className="py-8 text-center text-[13px] text-muted-foreground">No friends found.</p>
                )}
                {vm.friends.map((friend) => (
                    <ComposerFriendRow
                        key={friend.id}
                        friend={friend}
                        selected={vm.selectedIds.has(friend.id)}
                        inGroup={vm.excludedIds.has(friend.id)}
                        full={vm.isFull}
                        onToggle={() => vm.toggle(friend)}
                    />
                ))}
            </ScrollArea>

            {!vm.isAddMode && (
                <div className="border-t border-line px-6 py-4">
                    <div className="mb-2 flex items-baseline justify-between">
                        <label htmlFor="group-name" className="eye">
                            Group name
                        </label>
                        <span className="eye">Optional</span>
                    </div>
                    <input
                        id="group-name"
                        value={vm.name}
                        onChange={(e) => vm.setName(e.target.value)}
                        placeholder="Leave blank to use members' names"
                        className="h-10 w-full rounded-[12px] border border-line2 bg-surf2 px-3.5 text-[13px] text-foreground placeholder:text-muted-foreground outline-none transition-colors duration-150 focus:border-acc"
                    />
                </div>
            )}

            <div className="border-t border-line px-6 py-4">
                {vm.error && <p className="mb-3 text-[12px] text-dnd">{vm.error}</p>}
                {vm.hasFederatedSelection && (
                    <div className="mb-3 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <span>Some members are on other servers — they'll join over federation.</span>
                    </div>
                )}
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-muted-foreground">
                        <span className="font-mono">{vm.selectedFriends.length}</span> selected
                        {vm.isFull && ` · a group holds ${vm.maxMembers} people at most`}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="inline" onPress={onClose}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="inline"
                            onPress={vm.submit}
                            isDisabled={!vm.canSubmit}
                            className="px-5 disabled:opacity-45"
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
    inGroup,
    full,
    onToggle,
}: {
    friend: Friend
    selected: boolean
    inGroup: boolean
    /** The group has no room left for anyone not already picked. */
    full: boolean
    onToggle: () => void
}) {
    const disabled = inGroup || (full && !selected)
    const initials = friend.name
        .split(" ")
        .map((n) => n[0])
        .join("")

    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            className={cn(
                "flex w-full items-center gap-3 rounded-full px-3 py-2 text-left transition-colors duration-150",
                disabled ? "cursor-default opacity-55" : "cursor-pointer hover:bg-surf",
                selected && !disabled && "bg-surf2 hover:bg-surf2",
            )}
        >
            <Avatar
                initials={initials}
                imageUrl={friend.avatarUrl}
                seed={friend.address}
                size="sm"
                status={friend.status}
                statusBorderClass="border-popover"
            />
            <span className="min-w-0 flex-1">
                <span className="title block truncate text-[15px] font-semibold text-foreground">{friend.name}</span>
                <span className="block truncate font-mono text-[10.5px] text-muted-foreground">{friend.address}</span>
            </span>
            {inGroup ? (
                <span className="fact">in group</span>
            ) : (
                <span
                    className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px] border",
                        selected ? "border-acc bg-acc text-acc-ink" : "border-line2",
                    )}
                >
                    {selected && <Check className="h-3 w-3" />}
                </span>
            )}
        </button>
    )
}
