import { useState, type ReactNode } from "react"
import { AtSign, Bell, Check, ChevronRight, Hash, LogOut, Moon, Pencil, UserPen } from "lucide-react"
import { useAppStore } from "@/store/store"
import { logoutUseCase } from "@pinai/domain/usecases/auth/logout.usecase"
import { setPresenceUseCase } from "@pinai/domain/usecases/presence/set-presence.usecase"
import { getAuthPlatform, getWsPort } from "@/ioc"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Popover, PopoverCaret } from "@/presentation/molecules/Popover/Popover"
import { popoverSurface } from "@/presentation/molecules/Popover/popover-surface"
import { cn } from "@/presentation/_libs/utils"
import type { UserStatus } from "@pinai/domain/models/presence"

interface StatusMeta {
    id: UserStatus
    label: string
    /** Only set where the side-effect is non-obvious from the label alone. */
    subtitle?: string
    /** CSS colour — also drives the chip tint and the selected ring. */
    dot: string
}

const STATUSES: StatusMeta[] = [
    { id: "online", label: "Online", dot: "var(--on)" },
    { id: "idle", label: "Idle", dot: "var(--idle)" },
    { id: "dnd", label: "Do not disturb", subtitle: "You will not receive any notifications.", dot: "var(--dnd)" },
    { id: "invisible", label: "Invisible", subtitle: "Your friends will see you offline.", dot: "var(--muted-foreground)" },
]

const STATUS_PILL: Record<UserStatus, string> = {
    online: "online",
    idle: "idle",
    dnd: "do not disturb",
    invisible: "invisible",
    offline: "offline",
}

const popLinkClass =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-2.5 py-[5px] text-[11.5px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-surf2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

interface UserBarPopoverProps {
    trigger: ReactNode
    isOpen?: boolean
    onOpenChange?: (open: boolean) => void
}

export function UserBarPopover({ trigger, isOpen, onOpenChange }: UserBarPopoverProps) {
    const user = useAppStore((s) => s.user)
    const myStatus = useAppStore((s) => s.myStatus)
    const setMyStatus = useAppStore((s) => s.setMyStatus)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const clearSession = useAppStore((s) => s.clearSession)
    const setShowSettings = useAppStore((s) => s.setShowSettings)
    const view = useAppStore((s) => s.view)
    const activeServer = useAppStore((s) => s.activeServer)
    const activeChannel = useAppStore((s) => s.activeChannel)
    const channelsByServer = useAppStore((s) => s.channelsByServer)
    const servers = useAppStore((s) => s.servers)

    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = isOpen !== undefined
    const openResolved = isControlled ? isOpen : internalOpen
    const [copied, setCopied] = useState(false)

    function setOpen(open: boolean) {
        if (!isControlled) setInternalOpen(open)
        onOpenChange?.(open)
    }

    if (!user) return null

    const displayName = user.display_name ?? user.preferred_username
    const initials = displayName.slice(0, 2).toUpperCase()
    const activePresence = STATUSES.find((s) => s.id === myStatus) ?? STATUSES[0]
    const pronounsLabel = user.pronouns
        ? user.pronouns === "he"
            ? "he / him"
            : user.pronouns === "she"
              ? "she / her"
              : "non-binary"
        : null

    const viewingChannel =
        view === "server" && activeChannel
            ? channelsByServer[activeServer]?.find((c) => c.id === activeChannel)
            : undefined
    const viewingServer = viewingChannel ? servers.find((s) => s.id === activeServer) : undefined

    function handleSignOut() {
        if (!idpUrl) return
        setOpen(false)
        logoutUseCase(idpUrl, clearSession, getAuthPlatform())
    }

    function handleOpenSettings() {
        setOpen(false)
        setShowSettings(true)
    }

    const userAddress = user.address
    function handleCopyAddress() {
        navigator.clipboard.writeText(userAddress)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
    }

    return (
        <Popover
            trigger={trigger}
            placement="top start"
            offset={12}
            isOpen={openResolved}
            onOpenChange={setOpen}
            className={cn(popoverSurface, "relative w-[500px]")}
        >
            <PopoverCaret side="down" className="left-12" />

            <div className="relative overflow-hidden rounded-[17px]">
                <div className="flex items-start gap-3.5 border-b border-line bg-[color-mix(in_oklab,var(--acc)_10%,transparent)] px-[18px] pb-3.5 pt-4">
                    <button
                        type="button"
                        aria-label="Change avatar"
                        className="group relative shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
                    >
                        <Avatar initials={initials} imageUrl={user.avatar_url} tone="acc" size="xl" />
                        <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--background)_70%,transparent)] opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
                        >
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line2 bg-background text-foreground">
                                <Pencil className="h-3.5 w-3.5" />
                            </span>
                        </span>
                        <span
                            className="absolute -bottom-px -right-px h-4 w-4 rounded-full border-[3px] border-popover"
                            style={{ background: activePresence.dot }}
                        />
                    </button>
                    <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <h2 className="title text-[19px] font-semibold leading-[1.15] text-foreground">{displayName}</h2>
                            <StatusChip color={activePresence.dot}>{STATUS_PILL[myStatus]}</StatusChip>
                        </div>
                        <p className="mt-[3px] truncate font-mono text-[10.5px] text-muted-foreground">
                            {user.address}
                            {pronounsLabel && <span className="ml-2 opacity-80">· {pronounsLabel}</span>}
                        </p>
                        {user.bio && (
                            <p className="title mt-[7px] break-words text-[13px] italic leading-[1.35] text-[color-mix(in_oklab,var(--foreground)_85%,transparent)]">
                                {user.bio}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex">
                    <div className="flex-1 border-r border-line px-1.5 py-2.5">
                        <span className="eye block px-2.5 pb-1.5 pt-1">Presence</span>
                        {STATUSES.map((s) => {
                            const active = s.id === myStatus
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                        setMyStatus(s.id)
                                        setPresenceUseCase(getWsPort(), s.id)
                                    }}
                                    className={cn(
                                        "flex w-full cursor-pointer gap-2.5 rounded-[12px] px-2.5 py-[7px] text-left text-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                                        s.subtitle ? "items-start" : "items-center",
                                        active ? "bg-surf2" : "hover:bg-surf",
                                    )}
                                >
                                    <span
                                        className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.subtitle && "mt-1")}
                                        style={{
                                            background: s.dot,
                                            boxShadow: active ? `0 0 0 3px color-mix(in oklab, ${s.dot} 28%, transparent)` : "none",
                                        }}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className={cn("text-[12.5px]", active && "font-semibold")}>{s.label}</span>
                                        {s.subtitle && (
                                            <span className="mt-0.5 block text-[10.5px] leading-[1.35] text-muted-foreground">
                                                {s.subtitle}
                                            </span>
                                        )}
                                    </span>
                                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-acc" />}
                                </button>
                            )
                        })}

                        <div className="mt-1.5 border-t border-line pt-1.5">
                            <button
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2.5 rounded-[12px] px-2.5 py-[7px] text-left text-[12.5px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-surf focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Bell className="h-3.5 w-3.5" />
                                <span className="flex-1">Mute notifications</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2.5 rounded-[12px] px-2.5 py-[7px] text-left text-[12.5px] text-muted-foreground outline-none transition-colors duration-150 hover:bg-surf focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Moon className="h-3.5 w-3.5" />
                                <span className="flex-1">Quiet hours</span>
                                <span className="font-mono text-[10px]">22–7</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex-[1.1] px-3 py-2.5">
                        <span className="eye block pb-2 pt-1">Now</span>

                        {viewingChannel ? (
                            <div className="rounded-[12px] border border-line px-[11px] py-[9px]">
                                <p className="eye mb-1">Viewing</p>
                                <div className="flex items-center gap-1.5">
                                    <Hash className="h-3.5 w-3.5 shrink-0 text-acc" />
                                    <span className="title truncate text-[15px] font-semibold text-foreground">
                                        {viewingChannel.name}
                                    </span>
                                    {viewingServer && (
                                        <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                                            {viewingServer.name}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-[92px] flex-col items-center justify-center rounded-[12px] border border-dashed border-line2 bg-surf px-3 text-center">
                                <p className="title text-[14px] text-muted-foreground">Quiet · no live session</p>
                                <p className="mt-1 text-[10.5px] leading-[1.4] text-muted-foreground">
                                    When you join voice or open a channel,
                                    <br />
                                    it will surface here.
                                </p>
                            </div>
                        )}

                        <p className="mt-2.5 text-center text-[11px] text-muted-foreground">Friends see your activity</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 border-t border-line bg-surf px-3.5 py-[9px]">
                    <button type="button" onClick={handleOpenSettings} className={popLinkClass}>
                        <UserPen className="h-3.5 w-3.5" />
                        Modify profile
                    </button>
                    <button
                        type="button"
                        onClick={handleCopyAddress}
                        className={cn(popLinkClass, copied && "text-on hover:text-on")}
                        aria-label="Copy address"
                    >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <AtSign className="h-3.5 w-3.5" />}
                        {copied ? "Copied" : "Copy address"}
                    </button>
                    <span className="flex-1" />
                    <button
                        type="button"
                        onClick={handleSignOut}
                        className={cn(
                            popLinkClass,
                            "border-[color-mix(in_oklab,var(--dnd)_55%,transparent)] text-dnd hover:bg-[color-mix(in_oklab,var(--dnd)_12%,transparent)] hover:text-dnd",
                        )}
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                    </button>
                </div>
            </div>
        </Popover>
    )
}

function StatusChip({ color, children }: { color: string; children: ReactNode }) {
    return (
        <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em]"
            style={{ color, background: `color-mix(in oklab, ${color} 18%, transparent)` }}
        >
            {children}
        </span>
    )
}
