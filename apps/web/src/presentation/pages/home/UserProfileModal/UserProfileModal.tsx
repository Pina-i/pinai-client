import { MessageSquare, X } from "lucide-react"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Button } from "@/presentation/atoms/Button/Button"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { avatarToneFor, TONE_FILL } from "@/presentation/_libs/avatar-tone"
import { cn } from "@/presentation/_libs/utils"
import type { Member } from "@/lib/types"

interface UserProfileModalProps {
    member: Member | null
    onClose: () => void
    onSendMessage: (memberName: string) => void
}

const roleChipClass: Record<Member["role"], string> = {
    Admin: "bg-acc-soft text-acc",
    Mod: "bg-[color-mix(in_oklab,var(--on)_18%,transparent)] text-on",
    Member: "bg-surf2 text-muted-foreground",
}

export function UserProfileModal({ member, onClose, onSendMessage }: UserProfileModalProps) {
    return (
        <Modal isOpen={!!member} onClose={onClose} label="User profile">
            {member && (
                <div className={cn(modalSurface, "w-[320px]")}>
                    {/* Seeded like the member's Avatar, so the banner echoes their colour. */}
                    <div className="h-[72px] shrink-0" style={{ background: TONE_FILL[avatarToneFor(member.id)] }} />

                    <div className="px-[18px]">
                        <span className="-mt-8 inline-flex rounded-full border-4 border-popover">
                            <Avatar
                                initials={member.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")}
                                seed={member.id}
                                size="lg"
                                status={member.status}
                                statusBorderClass="border-popover"
                            />
                        </span>
                    </div>

                    <div className="px-[18px] pb-[18px] pt-2">
                        <h2 className="title text-[22px] font-semibold text-foreground">{member.name}</h2>
                        <span
                            className={cn(
                                "mt-1 inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em]",
                                roleChipClass[member.role],
                            )}
                        >
                            {member.role}
                        </span>

                        <div className="mt-3.5 rounded-[14px] border border-line bg-surf p-3">
                            <p className="eye mb-1 text-foreground">About me</p>
                            <p className="text-[13px] leading-[1.5] text-muted-foreground">{member.about}</p>
                        </div>

                        <div className="mt-3.5 flex gap-2">
                            <Button
                                variant="primary"
                                onPress={() => onSendMessage(member.name)}
                                className="flex-1 py-2.5"
                            >
                                <MessageSquare className="h-[15px] w-[15px]" />
                                Message
                            </Button>
                            <IconButton
                                onPress={onClose}
                                aria-label="Close"
                                className="h-10 w-10 shrink-0 rounded-full border border-line2 text-muted-foreground hover:bg-surf2 hover:text-foreground"
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
