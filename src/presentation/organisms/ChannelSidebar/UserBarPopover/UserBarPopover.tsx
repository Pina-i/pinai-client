import { useState, type ReactNode } from "react"
import { AtSign, Bell, Check, ChevronRight, Hash, LogOut, Moon, Pencil, UserPen } from "lucide-react"
import { useAppStore } from "@/store/store"
import { logoutUseCase } from "@/domain/usecases/auth/logout.usecase"
import { setPresenceUseCase } from "@/domain/usecases/presence/set-presence.usecase"
import { getWsPort } from "@/ioc"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Popover } from "@/presentation/molecules/Popover/Popover"
import { cn } from "@/presentation/_libs/utils"
import type { UserStatus } from "@/domain/models/presence"

interface StatusMeta {
    id: UserStatus
    label: string
    /** Optional one-liner shown under the label. Only set where the
     *  side-effect is non-obvious from the label alone. */
    subtitle?: string
    dotClass: string
}

const STATUSES: StatusMeta[] = [
    { id: "online", label: "Online", dotClass: "bg-online" },
    { id: "idle", label: "Idle", dotClass: "bg-idle" },
    { id: "dnd", label: "Do not disturb", subtitle: "You will not receive any notifications.", dotClass: "bg-dnd" },
    { id: "invisible", label: "Invisible", subtitle: "Your friends will see you offline.", dotClass: "bg-muted-foreground" },
]

const STATUS_PILL: Record<UserStatus, { label: string; className: string }> = {
    online: { label: "online", className: "bg-online/20 text-online" },
    idle: { label: "idle", className: "bg-idle/20 text-idle" },
    dnd: { label: "do not disturb", className: "bg-dnd/20 text-dnd" },
    invisible: { label: "invisible", className: "bg-muted text-muted-foreground" },
    offline: { label: "offline", className: "bg-muted text-muted-foreground" },
}

function Dot({ className, ring = false }: { className: string; ring?: boolean }) {
    return (
        <span
            className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                className,
                ring && "shadow-[0_0_0_3px_color-mix(in_oklab,currentColor_28%,transparent)]",
            )}
        />
    )
}

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
    const pill = STATUS_PILL[myStatus]
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
        logoutUseCase(idpUrl, clearSession)
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
            className="relative w-[500px] overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-popover shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.02)]"
        >
            {/* Caret pointing down to the trigger (popover sits above the UserBar) */}
            <div className="pointer-events-none absolute -bottom-[7px] left-6 h-[14px] w-[14px] rotate-45 border-b border-r border-border-strong bg-popover" />

            {/* Hero band */}
            <div className="flex items-start gap-3.5 border-b border-border bg-[color-mix(in_oklab,var(--chat)_10%,transparent)] px-[18px] pt-4 pb-3.5">
                <button
                    type="button"
                    aria-label="Change avatar"
                    className="group relative shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-chat focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
                >
                    <Avatar initials={initials} imageUrl={user.avatar_url} color="var(--chat)" size="lg" />
                    {/* Hover overlay — soft scrim + edit icon */}
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--background)_70%,transparent)] opacity-0 backdrop-blur-[2px] transition-all duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
                    >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong bg-popover/90 text-foreground shadow-[0_4px_12px_-2px_rgba(0,0,0,0.45)] scale-90 transition-transform duration-200 ease-out group-hover:scale-100">
                            <Pencil className="h-3.5 w-3.5" />
                        </span>
                    </span>
                    <span
                        className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-[3px] border-popover",
                            activePresence.dotClass,
                        )}
                    />
                </button>
                <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h2 className="title text-[17px] font-medium leading-tight text-foreground">{displayName}</h2>
                        <span
                            className={cn(
                                "rounded px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.08em]",
                                pill.className,
                            )}
                        >
                            {pill.label}
                        </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                        {user.address}
                        {pronounsLabel && (
                            <span className="ml-2 text-muted-foreground/80">· {pronounsLabel}</span>
                        )}
                    </p>
                    {user.bio && (
                        <p className="mt-1.5 break-words font-serif text-[12px] italic leading-snug text-foreground/85">
                            {user.bio}
                        </p>
                    )}
                </div>
            </div>

            {/* Two-column body */}
            <div className="flex">
                {/* LEFT — presence */}
                <div className="flex-1 border-r border-border px-1.5 py-2.5">
                    <p className="px-2.5 pt-1 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                        Presence
                    </p>
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
                                    "flex w-full cursor-pointer gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left transition-colors",
                                    s.subtitle ? "items-start" : "items-center",
                                    active ? "bg-accent" : "hover:bg-accent/40",
                                )}
                            >
                                <Dot className={cn(s.dotClass, s.subtitle && "mt-[5px]")} ring={active} />
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <span
                                        className={cn(
                                            "truncate text-[12.5px] text-foreground",
                                            active ? "title font-medium" : "font-normal",
                                        )}
                                    >
                                        {s.label}
                                    </span>
                                    {s.subtitle && (
                                        <span className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                                            {s.subtitle}
                                        </span>
                                    )}
                                </div>
                                {active && <Check className={cn("h-3.5 w-3.5 text-chat", s.subtitle && "mt-[3px]")} />}
                            </button>
                        )
                    })}

                    {/* Notification controls */}
                    <div className="mt-1.5 border-t border-border pt-1.5">
                        <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent/40"
                        >
                            <Bell className="h-3.5 w-3.5" />
                            <span className="flex-1 text-[12.5px]">Mute notifications</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent/40"
                        >
                            <Moon className="h-3.5 w-3.5" />
                            <span className="flex-1 text-[12.5px]">Quiet hours</span>
                            <span className="font-mono text-[10px]">22–7</span>
                        </button>
                    </div>
                </div>

                {/* RIGHT — now / activity */}
                <div className="flex-[1.1] px-3 py-2.5">
                    <p className="pt-1 pb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                        Now
                    </p>

                    {viewingChannel ? (
                        <div className="rounded-[var(--radius-sm)] border border-border px-2.5 py-2">
                            <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                                Viewing
                            </p>
                            <div className="flex items-center gap-1.5">
                                <Hash className="h-3.5 w-3.5 text-chat" />
                                <span className="title truncate text-[13px] font-medium text-foreground">
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
                        <div className="flex h-[88px] flex-col items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-border bg-[color-mix(in_oklab,var(--card)_50%,transparent)] px-3 text-center">
                            <p className="title text-[12.5px] text-muted-foreground">Quiet · no live session</p>
                            <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/80">
                                When you join voice or open a channel,
                                <br />
                                it will surface here.
                            </p>
                        </div>
                    )}

                    <p className="mt-2.5 text-center font-mono text-[10px] tracking-wide text-muted-foreground">
                        Friends see your activity
                    </p>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 border-t border-border bg-[color-mix(in_oklab,var(--card)_60%,transparent)] px-3.5 py-2">
                <button
                    type="button"
                    onClick={handleOpenSettings}
                    className="flex cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                >
                    <UserPen className="h-3.5 w-3.5" />
                    Modify profile
                </button>
                <button
                    type="button"
                    onClick={handleCopyAddress}
                    className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[11px] transition-colors",
                        copied
                            ? "text-success"
                            : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )}
                    aria-label="Copy address"
                >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <AtSign className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy address"}
                </button>
                <div className="flex-1" />
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-destructive px-2.5 py-1 text-[11px] text-destructive transition-colors hover:bg-destructive/10"
                >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                </button>
            </div>
        </Popover>
    )
}
