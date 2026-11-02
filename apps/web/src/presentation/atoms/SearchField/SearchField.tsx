import {
    SearchField as AriaSearchField,
    Input,
    type SearchFieldProps as AriaSearchFieldProps,
} from "react-aria-components"
import { Search } from "lucide-react"
import type { ReactNode, Ref } from "react"
import { cn } from "@/presentation/_libs/utils"
import { Kbd } from "@/presentation/atoms/Kbd/Kbd"

export interface SearchFieldProps
    extends Omit<AriaSearchFieldProps, "children" | "className" | "onChange"> {
    placeholder?: string
    icon?: ReactNode
    /** Optional kbd-style hint rendered on the right (e.g. "⌘K"). */
    shortcutHint?: ReactNode
    className?: string
    onChange?: (value: string) => void
    "aria-label"?: string
    inputRef?: Ref<HTMLInputElement>
}

export function SearchField({
    placeholder,
    icon,
    shortcutHint,
    className,
    onChange,
    inputRef,
    ...props
}: SearchFieldProps) {
    const iconNode = icon ?? <Search className="h-[15px] w-[15px] shrink-0" />

    return (
        <AriaSearchField
            {...props}
            onChange={onChange}
            className={cn(
                "relative flex h-[38px] w-full items-center gap-[9px] rounded-full border border-line bg-surf2 px-3.5",
                "text-[12px] text-muted-foreground",
                className,
            )}
        >
            {iconNode}
            <Input
                ref={inputRef}
                placeholder={placeholder}
                className="min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {shortcutHint && <Kbd className="ml-auto">{shortcutHint}</Kbd>}
        </AriaSearchField>
    )
}
