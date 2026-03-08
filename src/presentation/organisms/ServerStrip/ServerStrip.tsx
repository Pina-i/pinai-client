import pinaiLogo from "@/assets/pinai-logo.svg"
import { cn } from "@/presentation/_libs/utils"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"
import { useAppStore } from "@/store/store"
import { Plus } from "lucide-react"

export function ServerStrip() {
    const { servers, activeServer, view, switchToServer, switchToDms } = useAppStore()

    return (
        <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-sidebar py-3">
            {/* DMs button */}
            <Tooltip
                content="Direct Messages"
                placement="right"
                delay={300}
            >
                <IconButton
                    onPress={switchToDms}
                    aria-label="Direct Messages"
                    className={cn(
                        "relative flex h-12 w-12 items-center justify-center",
                        view === "dms"
                            ? "bg-primary text-primary-foreground"
                            : "bg-accent text-foreground hover:bg-primary hover:text-primary-foreground"
                    )}
                >
                    {view === "dms" && <span className="absolute -left-3 top-1/2 h-10 w-1 -translate-y-1/2 rounded-r-full bg-foreground" />}
                    <img
                        src={pinaiLogo}
                        alt="Pīna'i logo"
                        className="h-6"
                    />
                </IconButton>
            </Tooltip>

            <div className="mx-auto h-[2px] w-8 bg-border" />

            <ScrollArea className="w-full flex-1">
                <div className="flex flex-col items-center gap-2 px-3">
                    {servers.map((server) => (
                        <Tooltip
                            key={server.id}
                            content={server.name}
                            placement="right"
                            delay={300}
                        >
                            <IconButton
                                onPress={() => switchToServer(server.id)}
                                aria-label={server.name}
                                className={cn(
                                    "relative flex h-12 w-12 items-center justify-center text-sm font-semibold",
                                    view === "server" && activeServer === server.id
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-accent text-foreground hover:bg-primary hover:text-primary-foreground"
                                )}
                            >
                                {view === "server" && activeServer === server.id && (
                                    <span className="absolute -left-3 top-1/2 h-10 w-1 -translate-y-1/2 rounded-r-full bg-foreground" />
                                )}
                                {server.initials}
                            </IconButton>
                        </Tooltip>
                    ))}
                </div>
            </ScrollArea>

            {/* Add server */}
            <Tooltip
                content="Add a Server"
                placement="right"
                delay={300}
            >
                <IconButton
                    aria-label="Add a Server"
                    className="flex h-12 w-12 items-center justify-center bg-accent text-online hover:bg-online hover:text-primary-foreground"
                >
                    <Plus className="h-6 w-6" />
                </IconButton>
            </Tooltip>
        </div>
    )
}
