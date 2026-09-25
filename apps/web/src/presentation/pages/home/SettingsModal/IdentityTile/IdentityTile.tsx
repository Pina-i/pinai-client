import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Motif } from "@/presentation/atoms/motif/motif"
import { cn } from "@/presentation/_libs/utils"

interface IdentityTileProps {
    displayName: string
    handle: string
    email?: string
    initials: string
    avatarUrl?: string | null
    onManageAccount: () => void
}

// Fades the field out between the edges, so the pattern reads as a top and bottom rule.
const EDGE_MASK =
    "linear-gradient(180deg,#000 0,#000 13px,transparent 24px,transparent calc(100% - 24px),#000 calc(100% - 13px),#000 100%)"

export function IdentityTile({ displayName, handle, email, initials, avatarUrl, onManageAccount }: IdentityTileProps) {
    return (
        <div
            className={cn(
                "relative mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-3.5 overflow-hidden rounded-[18px] px-5 py-[18px]",
                "border border-[color-mix(in_oklab,var(--acc)_25%,var(--line2))]",
                "bg-[linear-gradient(135deg,color-mix(in_oklab,var(--acc)_14%,var(--surf)),var(--surf))]",
            )}
        >
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}>
                <Motif variant="field" className="absolute inset-0" style={{ opacity: "var(--motif-opacity)" }} />
            </div>
            <div className="relative z-[1] shrink-0">
                <Avatar initials={initials} imageUrl={avatarUrl} tone="acc" size="lg" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-background bg-on" />
            </div>
            <div className="relative z-[1] min-w-[140px] flex-[1_1_150px]">
                <h3 className="title text-[18px] font-semibold leading-[1.25] text-foreground">{displayName}</h3>
                <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                    @{handle}
                    {email && ` · ${email}`}
                </p>
            </div>
            <IconButton
                onPress={onManageAccount}
                className={cn(
                    "relative z-[1] shrink-0 whitespace-nowrap rounded-full border border-transparent bg-action px-3.5 py-[7px]",
                    "text-[12px] font-semibold text-action-foreground hover:opacity-90",
                )}
            >
                Manage account
            </IconButton>
        </div>
    )
}
