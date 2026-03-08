import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Switch } from "@/presentation/atoms/Switch/Switch"

export function ThemeSwitcher() {
    const { resolvedTheme, setTheme } = useTheme()
    const isLight = resolvedTheme === "light"

    return (
        <Switch
            isSelected={isLight}
            onChange={(selected) => setTheme(selected ? "light" : "dark")}
            aria-label="Toggle theme"
        >
            {isLight ? (
                <Sun className="h-4 w-4 text-foreground" />
            ) : (
                <Moon className="h-4 w-4 text-foreground" />
            )}
        </Switch>
    )
}
