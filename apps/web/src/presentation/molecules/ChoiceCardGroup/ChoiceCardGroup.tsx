import type { ReactNode } from "react"
import { Radio, RadioGroup } from "react-aria-components"
import { cn } from "@/presentation/_libs/utils"

interface ChoiceCardGroupProps<V extends string> {
    /** Accessible name for the group. */
    label: string
    value: V
    onChange: (value: V) => void
    className?: string
    children: ReactNode
}

/**
 * One choice out of several, each shown as a card. Radio semantics: arrow keys
 * move between cards and the group is a single tab stop.
 */
export function ChoiceCardGroup<V extends string>({ label, value, onChange, className, children }: ChoiceCardGroupProps<V>) {
    return (
        <RadioGroup
            aria-label={label}
            value={value}
            onChange={(next) => onChange(next as V)}
            className={className}
        >
            {children}
        </RadioGroup>
    )
}

interface ChoiceCardProps {
    value: string
    /** Accessible name, when the card's content alone doesn't say what it picks. */
    label?: string
    /** Classes for the card; selected and focus styling comes from `selectedClassName` and the ring. */
    className?: string
    selectedClassName?: string
    children: (state: { isSelected: boolean }) => ReactNode
}

export function ChoiceCard({ value, label, className, selectedClassName, children }: ChoiceCardProps) {
    return (
        <Radio
            value={value}
            aria-label={label}
            className={({ isSelected, isFocusVisible }) =>
                cn(
                    "cursor-pointer text-left text-foreground outline-none transition-[border-color,background-color,box-shadow] duration-150",
                    className,
                    isSelected && selectedClassName,
                    isFocusVisible && "outline-2 outline-offset-2 outline-acc",
                )
            }
        >
            {({ isSelected }) => children({ isSelected })}
        </Radio>
    )
}
