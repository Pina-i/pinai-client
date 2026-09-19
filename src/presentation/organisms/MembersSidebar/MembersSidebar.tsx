import { Button } from "react-aria-components"
import { useAppStore } from "@/store/store"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { cn } from "@/presentation/_libs/utils"
import type { UserStatus } from "@/domain/models/presence"

const statusGroups: { status: UserStatus; label: string }[] = [
    { status: "online", label: "Online" },
    { status: "idle", label: "Idle" },
    { status: "dnd", label: "Do Not Disturb" },
    { status: "offline", label: "Offline" },
]

export function MembersSidebar() {
    const { members, showUserProfile, setShowUserProfile } = useAppStore()

    return (
        <div className="hidden w-60 shrink-0 border-l border-border bg-card lg:block">
            <ScrollArea className="h-full px-2 py-4">
                {statusGroups.map(({ status, label }) => {
                    const filtered = members.filter((m) => m.status === status)
                    if (filtered.length === 0) return null
                    return (
                        <div key={status} className="mb-3">
                            <h3 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {label} — {filtered.length}
                            </h3>
                            {filtered.map((member) => {
                                const initials = member.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                return (
                                    <Button
                                        key={member.id}
                                        onPress={() =>
                                            setShowUserProfile(showUserProfile?.id === member.id ? null : member)
                                        }
                                        className={cn(
                                            "flex w-full items-center gap-2 px-2 py-1.5 outline-none transition-colors hover:bg-accent/50 cursor-pointer",
                                            status === "offline" && "opacity-40 hover:opacity-60",
                                        )}
                                    >
                                        <Avatar
                                            initials={initials}
                                            color={member.color}
                                            size="sm"
                                            status={member.status}
                                            statusBorderClass="border-card"
                                        />
                                        <div className="min-w-0 flex-1 text-left">
                                            <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                                            {member.role !== "Member" && (
                                                <p className="text-xs text-muted-foreground">{member.role}</p>
                                            )}
                                        </div>
                                    </Button>
                                )
                            })}
                        </div>
                    )
                })}
            </ScrollArea>
        </div>
    )
}
