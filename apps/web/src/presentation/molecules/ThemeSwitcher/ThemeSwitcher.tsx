import { Moon, Sun } from "lucide-react"
import { Switch as AriaSwitch } from "react-aria-components"
import { useAppearance } from "@/presentation/providers/AppearanceProvider/AppearanceProvider.context"
import { cn } from "@/presentation/_libs/utils"

/**
 * Flips the current palette between dark and light on this device. From
 * `system`, it pins the mode opposite to the one showing.
 */
export function ThemeSwitcher() {
    const { mode, setModePreference } = useAppearance()
    const isLight = mode === "light"

    return (
        <div className="flex items-center gap-2 rounded-full bg-surf2 px-[11px] py-[5px] text-muted-foreground">
            <Moon className="h-3 w-3" />
            <AriaSwitch
                isSelected={isLight}
                onChange={(selected) => setModePreference(selected ? "light" : "dark")}
                aria-label="Toggle light"
                className="group flex shrink-0 cursor-pointer items-center outline-none"
            >
                <div className="relative h-3.5 w-[26px] rounded-full bg-surf3 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background">
                    <span
                        className={cn(
                            "absolute left-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-foreground transition-transform duration-200",
                            isLight && "translate-x-3",
                        )}
                    />
                </div>
            </AriaSwitch>
            <Sun className="h-3 w-3" />
        </div>
    )
}
