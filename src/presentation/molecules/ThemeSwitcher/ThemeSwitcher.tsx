import { Switch } from "@/presentation/atoms/Switch/Switch"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeSwitcher() {
    const { resolvedTheme, setTheme } = useTheme()
    const isLight = resolvedTheme === "light"

    return (
        <div className="flex items-center space-x-1">
            <Moon className="h-4 w-4 text-foreground" />
            <Switch
                isSelected={isLight}
                onChange={(selected) => setTheme(selected ? "light" : "dark")}
                aria-label="Toggle theme"
            ></Switch>
            <Sun className="h-4 w-4 text-foreground" />
        </div>
    )
}
