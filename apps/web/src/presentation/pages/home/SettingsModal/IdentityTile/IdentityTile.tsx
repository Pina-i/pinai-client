import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

interface IdentityTileProps {
    displayName: string
    handle: string
    email?: string
    initials: string
    avatarUrl?: string | null
    onManageAccount: () => void
}

export function IdentityTile({ displayName, handle, email, initials, avatarUrl, onManageAccount }: IdentityTileProps) {
    return (
        <div
            className={cn(
                "mb-3.5 flex items-center gap-4 rounded-[var(--radius)] p-[18px_20px]",
                "border border-[color-mix(in_oklab,var(--chat)_25%,var(--border))]",
                "bg-[linear-gradient(135deg,color-mix(in_oklab,var(--chat)_14%,var(--card)),var(--card))]",
            )}
        >
            <div className="relative">
                <Avatar initials={initials} imageUrl={avatarUrl} color="var(--chat)" size="lg" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-card bg-online" />
            </div>
            <div className="min-w-0 flex-1">
                <h3 className="title text-[18px] font-medium leading-tight text-foreground">{displayName}</h3>
                <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                    @{handle}
                    {email && ` · ${email}`}
                </p>
            </div>
            <IconButton
                onPress={onManageAccount}
                className={cn(
                    "shrink-0 rounded-[5px] border border-chat bg-transparent px-3.5 py-[7px]",
                    "text-[12px] font-medium text-chat hover:bg-chat/10",
                )}
            >
                Manage account
            </IconButton>
        </div>
    )
}
