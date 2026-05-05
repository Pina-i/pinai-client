import { cn } from "@/presentation/_libs/utils"
import type { UserStatus } from "@/lib/types"

const sizeClasses = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-16 w-16 text-xl",
}

const dotSizeClasses = {
    xs: "h-2 w-2",
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
}

const statusColorClasses: Record<UserStatus, string> = {
    online: "bg-online",
    idle: "bg-idle",
    dnd: "bg-dnd",
    invisible: "bg-muted-foreground",
    offline: "bg-muted-foreground",
}

interface AvatarProps {
    initials: string
    /** When set, displays the image instead of initials. */
    imageUrl?: string | null
    color?: string
    size?: keyof typeof sizeClasses
    status?: UserStatus
    /** Tailwind border-color class matching the parent background, e.g. "border-card" */
    statusBorderClass?: string
    className?: string
}

export function Avatar({
    initials,
    imageUrl,
    color,
    size = "sm",
    status,
    statusBorderClass = "border-card",
    className,
}: AvatarProps) {
    return (
        <div className={cn("relative shrink-0", className)}>
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt={initials}
                    className={cn(
                        "rounded-full object-cover",
                        sizeClasses[size],
                    )}
                />
            ) : (
                <div
                    className={cn(
                        "title flex items-center justify-center rounded-full font-semibold",
                        sizeClasses[size],
                        !color && "bg-primary text-primary-foreground",
                    )}
                    style={color ? { backgroundColor: color, color: "oklch(0.18 0.008 60)" } : undefined}
                >
                    {initials}
                </div>
            )}
            {status && (
                <span
                    className={cn(
                        "absolute -bottom-0.5 -right-0.5 rounded-full border-2",
                        dotSizeClasses[size],
                        statusBorderClass,
                        statusColorClasses[status],
                    )}
                />
            )}
        </div>
    )
}
