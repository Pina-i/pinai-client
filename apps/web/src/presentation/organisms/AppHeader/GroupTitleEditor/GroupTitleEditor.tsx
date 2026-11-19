import { Check, X } from "lucide-react"
import { useRef } from "react"
import { Input, TextField } from "react-aria-components"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { useNameField } from "@/presentation/hooks/use-name-field"
import { useRenameGroup } from "@/presentation/hooks/useRenameGroup"

interface GroupTitleEditorProps {
    conversationId: string
    /** `null` while the group is unnamed. */
    groupName: string | null
    /** What the group reads as while unnamed. */
    placeholder: string
    onDone: () => void
}

/** The header's title, renamed in place. */
export function GroupTitleEditor({ conversationId, groupName, placeholder, onDone }: GroupTitleEditorProps) {
    const rename = useRenameGroup(conversationId, groupName)
    const inputRef = useRef<HTMLInputElement>(null)
    const field = useNameField(inputRef, rename.draft, rename.setDraft, rename.maxLength)

    async function submit() {
        if (rename.isPending || rename.isBlank) return
        if (rename.isUnchanged) return onDone()
        if (rename.canSave && (await rename.save())) onDone()
    }

    return (
        <span className="flex min-w-0 items-center gap-1.5">
            <TextField
                aria-label="Group name"
                autoFocus
                value={rename.draft}
                onChange={field.onChange}
                onCompositionStart={field.onCompositionStart}
                onCompositionEnd={field.onCompositionEnd}
                onKeyDown={(e) => {
                    // An IME's Enter or Escape ends its composition, never the edit.
                    if (e.nativeEvent.isComposing) return
                    if (e.key === "Enter") void submit()
                    else if (e.key === "Escape") onDone()
                    else e.continuePropagation()
                }}
                className="w-[min(340px,100%)] min-w-0"
            >
                <Input
                    ref={inputRef}
                    placeholder={placeholder}
                    className="title w-full rounded-[10px] bg-surf2 px-2.5 py-0.5 text-[19px] font-semibold text-foreground shadow-[inset_0_0_0_1.5px_var(--acc)] outline-none placeholder:text-muted-foreground"
                />
            </TextField>
            <IconButton
                variant="ghost"
                aria-label="Save name"
                isDisabled={rename.isBlank || rename.isPending}
                onPress={() => void submit()}
                className="bg-action text-action-foreground hover:bg-action hover:text-action-foreground disabled:opacity-45"
            >
                <Check className="h-[15px] w-[15px]" />
            </IconButton>
            <IconButton variant="ghost" aria-label="Cancel" onPress={onDone}>
                <X className="h-[15px] w-[15px]" />
            </IconButton>
        </span>
    )
}
