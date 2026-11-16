import type { RefObject } from "react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { AvatarStack } from "@/presentation/atoms/AvatarStack/AvatarStack"
import { Button } from "@/presentation/atoms/Button/Button"
import { TextField } from "@/presentation/atoms/TextField/TextField"
import { AnchoredPopover } from "@/presentation/molecules/AnchoredPopover/AnchoredPopover"
import { useRenameGroup } from "@/presentation/hooks/useRenameGroup"
import type { DmConversation } from "@/lib/types"

interface RenameGroupPopoverProps {
    group: DmConversation
    /** The group's row in the list, which the popover points at. */
    anchorRef: RefObject<HTMLElement | null>
    onClose: () => void
}

export function RenameGroupPopover({ group, anchorRef, onClose }: RenameGroupPopoverProps) {
    const rename = useRenameGroup(group.id, group.groupName)
    const preview = rename.draft.trim() || group.displayName
    const count = group.memberCount

    async function save() {
        if (rename.canSave && (await rename.save())) onClose()
    }

    return (
        <AnchoredPopover
            anchorRef={anchorRef}
            isOpen
            onClose={onClose}
            label="Rename group"
            className="w-[360px] px-4 pb-3.5 pt-4"
        >
            <p className="eye">Rename group</p>
            <p className="title mb-3 mt-1 text-[20px] tracking-[-0.01em] text-foreground">What should everyone call it?</p>
            <TextField
                aria-label="Group name"
                autoFocus
                value={rename.draft}
                onChange={rename.setDraft}
                maxLength={rename.maxLength}
                placeholder={group.displayName}
                onKeyDown={(e) => {
                    if (e.key === "Enter") void save()
                    else e.continuePropagation()
                }}
                trailing={
                    <span className="font-mono text-[10px] tracking-[0.03em] text-muted-foreground">
                        {rename.draft.length}/{rename.maxLength}
                    </span>
                }
            />

            <p className="eye mb-1.5 mt-3.5">How it will read</p>
            <div className="flex items-center gap-2.5 rounded-[14px] border border-dashed border-line2 px-2.5 py-2">
                <Avatar initials={preview.slice(0, 2).toUpperCase()} seed={group.address} tone="sec" size="sm" />
                <span className="flex min-w-0 flex-col">
                    <span className="title truncate text-[14px] font-semibold text-foreground">{preview}</span>
                    <span className="text-[11px] text-muted-foreground">
                        {count} {count === 1 ? "member" : "members"}
                    </span>
                </span>
            </div>
            <div className="mt-3 flex items-center gap-2.5">
                <AvatarStack
                    people={group.memberNames.map((name) => ({ initials: name.slice(0, 2).toUpperCase(), seed: name }))}
                    size="xs"
                    max={4}
                    ringClass="border-popover"
                />
                <span className="font-mono text-[10px] tracking-[0.03em] text-muted-foreground">
                    {count === 1 ? "only you see the new name" : `all ${count} members see the new name`}
                </span>
            </div>

            <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" size="inline" className="px-4 py-2 text-[13px]" onPress={onClose}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    size="inline"
                    className="px-4 py-2 text-[13px]"
                    isDisabled={!rename.canSave}
                    onPress={() => void save()}
                >
                    {rename.isPending ? "Renaming…" : "Rename"}
                </Button>
            </div>
        </AnchoredPopover>
    )
}
