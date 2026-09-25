import { ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { tv, type VariantProps } from "tailwind-variants"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"

const tileVariants = tv({
    slots: {
        root: [
            "flex min-h-[88px] flex-col items-stretch justify-start gap-1.5 rounded-[16px] border px-3.5 pb-3 pt-3.5",
            "text-left outline-none transition-colors duration-150 cursor-pointer",
            "focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-0",
        ].join(" "),
        iconBox: "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px]",
        label: "title text-[13.5px] font-medium",
    },
    variants: {
        state: {
            idle: {
                root: "border-line bg-surf hover:bg-surf2",
                iconBox: "bg-surf3 text-muted-foreground",
                label: "text-foreground",
            },
            active: {
                root: "border-[color-mix(in_oklab,var(--acc)_35%,var(--line2))] bg-[color-mix(in_oklab,var(--acc)_10%,var(--surf))]",
                iconBox: "bg-acc text-acc-ink",
                label: "text-foreground",
            },
            danger: {
                root: "border-line bg-surf hover:bg-[color-mix(in_oklab,var(--dnd)_7%,transparent)]",
                iconBox: "bg-surf3 text-dnd",
                label: "text-dnd",
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

    return (
        <IconButton onPress={onPress} className={styles.root()}>
            <span className="flex items-center gap-2">
                <span className={styles.iconBox()}>{icon}</span>
                <span className={styles.label()}>{label}</span>
                <span className="flex-1" />
                {state === "active" && <ChevronRight className="h-3.5 w-3.5 text-foreground" />}
            </span>
            <p className="text-[11.5px] leading-[1.45] text-muted-foreground">{description}</p>
            {preview && <span className="mt-auto block pt-1">{preview}</span>}
        </IconButton>
    )
}
