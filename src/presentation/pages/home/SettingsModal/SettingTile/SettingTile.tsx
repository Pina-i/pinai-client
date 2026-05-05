import { ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { tv, type VariantProps } from "tailwind-variants"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

const tileVariants = tv({
    slots: {
        root: [
            "flex min-h-[88px] flex-col gap-1.5 rounded-[var(--radius)] border p-3.5 pt-3.5 pb-3",
            "text-left outline-none transition-colors cursor-pointer",
            "focus-visible:ring-2 focus-visible:ring-ring",
        ].join(" "),
        iconBox: "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px]",
        label: "title text-[13.5px] font-medium",
    },
    variants: {
        state: {
            idle: {
                root: "border-border bg-card hover:bg-accent/30",
                iconBox: "bg-muted text-muted-foreground",
                label: "text-foreground",
            },
            active: {
                root: "border-[color-mix(in_oklab,var(--chat)_35%,var(--border))] bg-[color-mix(in_oklab,var(--chat)_10%,var(--card))]",
                iconBox: "bg-chat text-primary-foreground",
                label: "text-foreground",
            },
            danger: {
                root: "border-border bg-card hover:bg-destructive/5",
                iconBox: "bg-muted text-destructive",
                label: "text-destructive",
            },
        },
    },
    defaultVariants: {
        state: "idle",
    },
})

type TileVariantProps = VariantProps<typeof tileVariants>

interface SettingTileProps {
    icon: ReactNode
    label: string
    description: string
    preview?: ReactNode
    state?: TileVariantProps["state"]
    onPress?: () => void
}

export function SettingTile({ icon, label, description, preview, state = "idle", onPress }: SettingTileProps) {
    const styles = tileVariants({ state })
    const isActive = state === "active"

    return (
        <IconButton onPress={onPress} className={cn("flex-col items-stretch justify-start text-left", styles.root())}>
            <div className="flex items-center gap-2">
                <span className={styles.iconBox()}>{icon}</span>
                <span className={cn(styles.label())}>{label}</span>
                <span className="flex-1" />
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-chat" />}
            </div>
            <p className="text-[11.5px] leading-[1.45] text-muted-foreground">{description}</p>
            {preview && <div className="mt-auto pt-1">{preview}</div>}
        </IconButton>
    )
}
