import { X } from "lucide-react"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"

interface SettingsHeaderProps {
    onClose: () => void
}

export function SettingsHeader({ onClose }: SettingsHeaderProps) {
    return (
        <div className="mb-[22px] flex items-baseline justify-between">
            <div>
                <p className="mono-eyebrow mb-[5px] tracking-[0.14em] text-muted-foreground">— Settings</p>
                <h1 className="title text-[28px] font-normal leading-none tracking-[-0.015em] text-foreground">
                    Adjust the room.
                </h1>
            </div>
            <IconButton
                onPress={onClose}
                aria-label="Close settings"
                className="h-8 w-8 rounded-[var(--radius-sm)] border border-border-strong text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            >
                <X className="h-4 w-4" />
            </IconButton>
        </div>
    )
}
