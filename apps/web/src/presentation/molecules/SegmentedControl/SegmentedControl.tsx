import type { Key, ReactNode } from "react"
import { ToggleButton, ToggleButtonGroup } from "react-aria-components"
import { cn } from "@/presentation/_libs/utils"

export interface SegmentedControlItem<K extends string> {
    id: K
    label: string
    icon?: ReactNode
}

interface SegmentedControlProps<K extends string> {
    items: readonly SegmentedControlItem<K>[]
    selected: K
    onChange: (id: K) => void
    /** Accessible name for the group. */
    label: string
    className?: string
}

/** A pill of mutually exclusive options, exactly one always on. */
export function SegmentedControl<K extends string>({ items, selected, onChange, label, className }: SegmentedControlProps<K>) {
    return (
        <ToggleButtonGroup
            aria-label={label}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[selected]}
            onSelectionChange={(keys: Set<Key>) => {
                const [next] = keys
                if (next !== undefined) onChange(String(next) as K)
            }}
            className={cn("flex gap-[3px] rounded-full border border-line bg-surf2 p-[3px]", className)}
        >
            {items.map((item) => (
                <ToggleButton
                    key={item.id}
                    id={item.id}
                    className={cn(
                        "inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] text-muted-foreground outline-none",
                        "transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                        "selected:bg-surf3 selected:text-foreground selected:shadow-[inset_0_0_0_1px_var(--line2)]",
                    )}
                >
                    {item.icon}
                    {item.label}
                </ToggleButton>
            ))}
        </ToggleButtonGroup>
    )
}
