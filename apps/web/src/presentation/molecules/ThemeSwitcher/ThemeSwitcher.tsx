import { Moon, Sun } from "lucide-react"
import { motion } from "motion/react"
import { useTheme } from "next-themes"
import { Switch as AriaSwitch } from "react-aria-components"

export function ThemeSwitcher() {
    const { resolvedTheme, setTheme } = useTheme()
    const isLight = resolvedTheme === "light"

    return (
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-muted px-1.5 py-1">
            <Moon className="h-[13px] w-[13px] text-muted-foreground" />
            <AriaSwitch
                isSelected={isLight}
                onChange={(selected) => setTheme(selected ? "light" : "dark")}
                aria-label="Toggle theme"
                className="group flex shrink-0 cursor-pointer items-center outline-none"
            >
                <div className="box-border flex h-4 w-7 shrink-0 items-center rounded-full border border-border-strong bg-card px-px group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
                    <motion.span
                        initial={false}
                        animate={{ x: isLight ? "100%" : "0%" }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="h-3 w-3 rounded-full bg-foreground"
                    />
                </div>
            </AriaSwitch>
            <Sun className="h-[13px] w-[13px] text-muted-foreground" />
        </div>
    )
}
