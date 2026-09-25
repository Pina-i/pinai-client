import { cn } from "@/presentation/_libs/utils"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Logo } from "@/presentation/atoms/Logo/Logo"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"
import { useAppStore } from "@/store/store"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { IncomingDmBubbles } from "./IncomingDmBubbles/IncomingDmBubbles"

const tileClass = cn(
    "relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[16px] border text-[13px]",
    "backdrop-blur-[8px] transition-[background-color,border-color,box-shadow] duration-150",
)

export function ServerStrip() {
    const servers = useAppStore((s) => s.servers)
    const activeServer = useAppStore((s) => s.activeServer)
    const view = useAppStore((s) => s.view)
    const switchToServer = useAppStore((s) => s.switchToServer)
    const switchToDms = useAppStore((s) => s.switchToDms)
    const navigate = useNavigate()

    function handleDmsPress() {
        switchToDms()
        navigate({ to: "/home" })
    }

    return (
        <nav className="relative z-[2] flex w-[66px] shrink-0 flex-col items-center gap-2.5 py-3.5">
            <Tooltip content="Friends" placement="right" delay={300}>
                <IconButton
                    onPress={handleDmsPress}
                    aria-label="Friends"
                    className={cn(tileClass, "border-acc-line bg-surf2 text-foreground hover:bg-surf2")}
                >
                    <Logo className="h-5 w-[27px] text-foreground" />
                </IconButton>
            </Tooltip>

            <span aria-hidden className="my-[3px] h-0.5 w-[18px] shrink-0 rounded-[2px] bg-line2" />

            <IncomingDmBubbles />

            {/* Padded so the active tile's glow isn't clipped by the scroller. */}
            <ScrollArea className="-my-2 min-h-0 w-full shrink">
                <div className="flex flex-col items-center gap-2.5 py-2">
                    {servers.map((server) => {
                        const active = view === "server" && activeServer === server.id
                        return (
                            <Tooltip key={server.id} content={server.name} placement="right" delay={300}>
                                <IconButton
                                    onPress={() => switchToServer(server.id)}
                                    aria-label={server.name}
                                    className={cn(
                                        tileClass,
                                        "title text-foreground",
                                        active
                                            ? "border-acc bg-acc-soft shadow-[0_0_22px_-6px_var(--acc)]"
                                            : "border-line bg-surf hover:bg-surf2",
                                    )}
                                >
                                    {server.initials}
                                </IconButton>
                            </Tooltip>
                        )
                    })}
                </div>
            </ScrollArea>

            <Tooltip content="Add a Server" placement="right" delay={300}>
                <IconButton
                    aria-label="Add a Server"
                    className={cn(tileClass, "border-dashed border-line2 bg-transparent text-muted-foreground hover:text-foreground")}
                >
                    <Plus className="h-4 w-4" />
                </IconButton>
            </Tooltip>
        </nav>
    )
}
