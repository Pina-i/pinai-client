import { MessageSquare, X } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { cn } from "@/presentation/_libs/utils"
import type { Member } from "@/lib/types"

interface UserProfileModalProps {
    member: Member | null
    onClose: () => void
    onSendMessage: (memberName: string) => void
}

export function UserProfileModal({ member, onClose, onSendMessage }: UserProfileModalProps) {
    return (
        <Modal isOpen={!!member} onClose={onClose} label="User profile">
            {member && (
                <div className="w-80 border border-border bg-card" style={{ boxShadow: "var(--shadow-xl)" }}>
                    {/* Banner */}
                    <div className="h-16" style={{ backgroundColor: member.color }} />

                    {/* Avatar overlapping banner */}
                    <div className="relative px-4">
                        <div
                            className="-mt-8 flex h-16 w-16 items-center justify-center border-4 border-card text-lg font-bold text-primary-foreground"
                            style={{ backgroundColor: member.color }}
                        >
                            {member.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="px-4 pb-4 pt-2">
                        <h2 className="text-lg font-bold text-foreground">{member.name}</h2>
                        <span
                            className={cn(
                                "inline-block px-2 py-0.5 text-[10px] font-semibold",
                                member.role === "Admin"
                                    ? "bg-primary/20 text-primary"
                                    : member.role === "Mod"
                                      ? "bg-online/20 text-online"
                                      : "bg-accent text-muted-foreground",
                            )}
                        >
                            {member.role}
                        </span>

                        <div className="mt-3 bg-sidebar p-3">
                            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                                About Me
                            </h3>
                            <p className="text-sm text-muted-foreground">{member.about}</p>
                        </div>

                        <div className="mt-3 flex gap-2">
                            <Button
                                variant="primary"
                                onPress={() => onSendMessage(member.name)}
                                className="flex flex-1 items-center justify-center gap-1.5 py-1.5"
                            >
                                <MessageSquare className="h-4 w-4" /> Message
                            </Button>
                            <IconButton
                                onPress={onClose}
                                aria-label="Close"
                                className="bg-accent px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </IconButton>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    )
}
