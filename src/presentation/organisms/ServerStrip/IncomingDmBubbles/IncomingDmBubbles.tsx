import { useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { useAppStore } from "@/store/store"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Tooltip } from "@/presentation/atoms/Tooltip/Tooltip"

export function IncomingDmBubbles() {
    const localDmConvos = useAppStore((s) => s.localDmConvos)
    const dmUnread = useAppStore((s) => s.dmUnread)
    const avatarsByAddress = useAppStore((s) => s.avatarsByAddress)
    const activeDm = useAppStore((s) => s.activeDm)
    const switchToDms = useAppStore((s) => s.switchToDms)
    const navigate = useNavigate()

    // A bubble represents an unread conversation the user isn't currently
    // viewing. Opening that conversation already clears its unread count
    // (see ConversationPage.viewmodel), so the bubble disappears naturally.
    const pending = localDmConvos.filter(
        (dm) => (dmUnread[dm.id] ?? 0) > 0 && activeDm !== dm.id,
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
                                className="relative h-10 w-10 rounded-full hover:rounded-md transition-all"
                            >
                                <Avatar
                                    initials={dm.avatar}
                                    imageUrl={avatarUrl}
                                    color={dm.color}
                                    size="md"
                                />
                                <span
                                    className="absolute -bottom-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-chat px-1 font-mono text-[10px] font-bold text-primary-foreground"
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
