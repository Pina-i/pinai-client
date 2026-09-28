import { useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { isConversationMuted } from "@pinai/domain/models/mute"
import { useAppStore } from "@/store/store"
import { useNotificationSettings } from "@/presentation/providers/AppearanceProvider/NotificationSettings.context"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"

export function IncomingDmBubbles() {
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const dmUnread = useAppStore((s) => s.dmUnread)
    const avatarsByAddress = useAppStore((s) => s.avatarsByAddress)
    const activeDm = useAppStore((s) => s.activeDm)
    const switchToDms = useAppStore((s) => s.switchToDms)
    const { notifications } = useNotificationSettings()
    const navigate = useNavigate()

    // Opening a conversation clears its unread count (ConversationPage.viewmodel),
    // so its bubble disappears on its own. A muted one keeps its unread pill in the list, but no bubble.
    const pending = localDmConvos.filter(
        (dm) => (dmUnread[dm.id] ?? 0) > 0 && activeDm !== dm.id && !isConversationMuted(notifications, dm.id),
    )

    function handleOpen(address: string) {
        switchToDms()
        navigate({ to: "/dm/$name", params: { name: address } })
    }

    return (
        <AnimatePresence initial={false}>
            {pending.map((dm) => {
                const count = dmUnread[dm.id] ?? 0
                const avatarUrl = dm.kind === "dm" ? avatarsByAddress[dm.address] ?? null : null
                return (
                    <motion.div
                        key={dm.id}
                        layout
                        initial={{ scale: 0, opacity: 0, y: -8 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0, opacity: 0, transition: { duration: 0.15 } }}
                        transition={{ type: "spring", stiffness: 380, damping: 20 }}
                    >
                        <Tooltip
                            content={`New message from ${dm.displayName}`}
                            placement="right"
                            delay={300}
                        >
                            <IconButton
                                onPress={() => handleOpen(dm.address)}
                                aria-label={`Open conversation with ${dm.displayName}`}
                                className="relative h-[42px] w-[42px] rounded-full"
                            >
                                <Avatar
                                    initials={dm.avatar}
                                    imageUrl={avatarUrl}
                                    seed={dm.address}
                                    tone={dm.kind === "group" ? "sec" : undefined}
                                    size="md"
                                />
                                <span
                                    className="absolute -bottom-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-acc px-1 font-mono text-[9.5px] font-bold text-acc-ink"
                                    aria-hidden
                                >
                                    {count > 9 ? "9+" : count}
                                </span>
                            </IconButton>
                        </Tooltip>
                    </motion.div>
                )
            })}
        </AnimatePresence>
    )
}
