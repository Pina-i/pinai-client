import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { cn } from "@/presentation/_libs/utils"

export interface StackedAvatar {
    initials: string
    imageUrl?: string | null
    seed?: string
}

interface AvatarStackProps {
    people: StackedAvatar[]
    size?: "xs" | "sm" | "md"
    max?: number
    /** Border-color class matching the surface behind the stack (e.g. "border-card"). */
    ringClass?: string
    className?: string
}

const overlapClass = { xs: "-ml-2", sm: "-ml-2.5", md: "-ml-3" } as const
const bubbleClass = {
    xs: "h-6 w-6 text-[9px]",
    sm: "h-8 w-8 text-[10px]",
    md: "h-10 w-10 text-xs",
} as const

/** Overlapping avatars for a group, with a "+N" bubble when truncated. */
export function AvatarStack({ people, size = "sm", max = 3, ringClass = "border-card", className }: AvatarStackProps) {
    const shown = people.slice(0, max)
    const extra = people.length - shown.length

    return (
        <div className={cn("flex items-center", className)}>
            {shown.map((person, i) => (
                <div
                    key={i}
                    className={cn("rounded-full border-2", ringClass, i > 0 && overlapClass[size])}
                    style={{ zIndex: shown.length - i }}
                >
                    <Avatar initials={person.initials} imageUrl={person.imageUrl} seed={person.seed} size={size} />
                </div>
            ))}
            {extra > 0 && (
                <div
                    className={cn(
                        "flex shrink-0 items-center justify-center rounded-full border-2 bg-muted font-mono text-muted-foreground",
                        ringClass,
                        bubbleClass[size],
                        overlapClass[size],
                    )}
                >
                    +{extra}
                </div>
            )}
        </div>
    )
}
