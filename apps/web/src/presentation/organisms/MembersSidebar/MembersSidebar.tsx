import { Button } from "react-aria-components"
import { useAppStore } from "@/store/store"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { sidebarRowClass } from "@/presentation/organisms/ChannelSidebar/sidebar-row.styles"
import { cn } from "@/presentation/_libs/utils"
import { membersPanelClass } from "./members-panel.styles"
import type { UserStatus } from "@pinai/domain/models/presence"

const statusGroups: { status: UserStatus; label: string }[] = [
    { status: "online", label: "Online" },
    { status: "idle", label: "Idle" },
    { status: "dnd", label: "Do not disturb" },
    { status: "offline", label: "Offline" },
]

export function MembersSidebar() {
    const members = useAppStore((s) => s.members)
    const showUserProfile = useAppStore((s) => s.showUserProfile)
    const setShowUserProfile = useAppStore((s) => s.setShowUserProfile)

    return (
        <aside className={cn(membersPanelClass, "px-2.5 py-4")}>
            {statusGroups.map(({ status, label }) => {
                const filtered = members.filter((m) => m.status === status)
                if (filtered.length === 0) return null
                return (
                    <div key={status} className="mb-3.5">
                        <p className="eye mb-1.5 pl-2">
                            {label} <span className="fact ml-0.5">{filtered.length}</span>
                        </p>
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
                                    className={cn(sidebarRowClass, status === "offline" && "opacity-45")}
                                >
                                    <Avatar initials={initials} seed={member.id} size="sm" status={member.status} />
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-[13.5px] font-semibold text-foreground">
                                            {member.name}
                                        </span>
                                        {member.role !== "Member" && (
                                            <span className="truncate text-[11px] text-muted-foreground">{member.role}</span>
                                        )}
                                    </span>
                                </Button>
                            )
                        })}
                    </div>
                )
            })}
        </aside>
    )
}
