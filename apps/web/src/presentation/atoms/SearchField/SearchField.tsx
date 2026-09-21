import {
    SearchField as AriaSearchField,
    Input,
    type SearchFieldProps as AriaSearchFieldProps,
} from "react-aria-components"
import { Search } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/presentation/_libs/utils"

export interface SearchFieldProps
    extends Omit<AriaSearchFieldProps, "children" | "className" | "onChange"> {
    placeholder?: string
    icon?: ReactNode
    /** Optional kbd-style hint rendered on the right (e.g. "⌘K"). */
    shortcutHint?: ReactNode
    className?: string
    onChange?: (value: string) => void
    "aria-label"?: string
}

export function SearchField({
    placeholder,
    icon,
    shortcutHint,
    className,
    onChange,
    ...props
}: SearchFieldProps) {
    const iconNode = icon ?? <Search className="h-4 w-4 shrink-0 text-muted-foreground" />

    return (
        <AriaSearchField
            {...props}
            onChange={onChange}
            className={cn(
                "relative flex h-9 items-center gap-2 rounded-md border border-border bg-input px-3",
                className,
            )}
        >
            {iconNode}
            <Input
                placeholder={placeholder}
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
            {shortcutHint && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {shortcutHint}
                </span>
            )}
        </AriaSearchField>
    )
}
