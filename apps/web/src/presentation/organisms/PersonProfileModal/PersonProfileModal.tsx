import { Check, Copy, MessageSquare, X } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Motif } from "@/presentation/atoms/motif/motif"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { cn } from "@/presentation/_libs/utils"
import { usePersonProfileModalViewModel, type ProfilePerson } from "./PersonProfileModal.viewmodel"

export type { ProfilePerson } from "./PersonProfileModal.viewmodel"

interface PersonProfileModalProps {
    person: ProfilePerson | null
    onClose: () => void
    onMessage: () => void
}

const statusDotClass = {
    online: "bg-online",
    idle: "bg-idle",
    dnd: "bg-dnd",
    offline: "bg-muted-foreground",
} as const

const machineTextClass = "[font-variant-ligatures:none]"

export function PersonProfileModal({ person, onClose, onMessage }: PersonProfileModalProps) {
    return (
        <Modal
            isOpen={!!person}
            onClose={onClose}
            label={person ? `${person.displayName}'s profile` : "Profile"}
        >
            {person && (
                <Passport
                    person={person}
                    onClose={onClose}
                    onMessage={onMessage}
                />
            )}
        </Modal>
    )
}

function Passport({ person, onClose, onMessage }: { person: ProfilePerson; onClose: () => void; onMessage: () => void }) {
    const vm = usePersonProfileModalViewModel(person)

    return (
        <div className={cn(modalSurface, "w-[740px]")}>
            <div className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] max-[720px]:grid-cols-1">
                <div
                    className="relative flex flex-col items-center justify-center gap-[18px] overflow-hidden px-5 py-7 max-[720px]:p-5"
                    style={{ background: vm.sideFill }}
                >
                    <Motif
                        variant="field"
                        color={vm.sideInk}
                        className="absolute inset-0"
                        style={{ opacity: 0.34 }}
                    />
                    <div className="relative flex rounded-[42px] bg-[color-mix(in_oklab,var(--background)_35%,transparent)] p-1.5 backdrop-blur-[6px]">
                        {vm.avatarUrl ? (
                            <img
                                src={vm.avatarUrl}
                                alt={vm.initials}
                                className="h-[140px] w-[140px] rounded-[36px] object-cover"
                            />
                        ) : (
                            <span
                                className="title flex h-[140px] w-[140px] items-center justify-center rounded-[36px] text-[50px] font-semibold leading-none"
                                style={{ background: vm.photoFill, color: vm.photoInk }}
                            >
                                {vm.initials}
                            </span>
                        )}
                    </div>
                    <span className="relative inline-flex items-center gap-[7px] rounded-full bg-[color-mix(in_oklab,var(--background)_78%,transparent)] px-3 py-[5px] text-[11.5px] text-foreground">
                        <span className={cn("h-2 w-2 rounded-full", statusDotClass[vm.status])} />
                        {vm.presenceLabel}
                    </span>
                </div>

                <div className="min-w-0 overflow-y-auto py-[22px] pl-7 pr-6">
                    <div className="flex items-center gap-2">
                        <p className="fact flex-1">{vm.identityLabel}</p>
                        <Button
                            size="none"
                            onPress={onMessage}
                            className="px-3.5 py-[7px] text-[12px]"
                        >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Message
                        </Button>
                        <IconButton
                            onPress={onClose}
                            aria-label="Close"
                            className="h-8 w-8 shrink-0 rounded-full border border-line2 text-muted-foreground hover:bg-surf2 hover:text-foreground"
                        >
                            <X className="h-[15px] w-[15px]" />
                        </IconButton>
                    </div>

                    <h2 className="title mt-3.5 text-[46px] font-normal italic leading-none tracking-[-0.015em] text-foreground">
                        {person.displayName}
                    </h2>
                    <p className="mt-1.5 text-[13px] text-muted-foreground">{vm.pronouns}</p>
                    <p
                        className={cn(
                            "title mt-3.5 whitespace-pre-line break-words text-[15px] italic",
                            vm.bio ? "text-foreground" : "text-muted-foreground",
                        )}
                    >
                        {vm.bio ?? "No bio yet."}
                    </p>

                    <dl className="mt-5 grid grid-cols-2 gap-x-[22px] gap-y-3.5 border-t border-line pt-4">
                        <div>
                            <dt className="mb-1 text-[10.5px] font-medium text-muted-foreground">Handle</dt>
                            <dd className="min-w-0 text-[13px]">
                                <button
                                    type="button"
                                    title="Copy handle"
                                    onClick={vm.copyHandle}
                                    className={cn(
                                        "inline-flex max-w-full cursor-pointer items-center gap-1.5 font-mono text-[11px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                                        machineTextClass,
                                    )}
                                >
                                    <span className="truncate">{person.address}</span>
                                    {vm.isHandleCopied ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
                                </button>
                            </dd>
                        </div>
                        <div>
                            <dt className="mb-1 text-[10.5px] font-medium text-muted-foreground">Home server</dt>
                            <dd className="min-w-0 truncate text-[13px] text-foreground">{vm.homeServer}</dd>
                        </div>
                        <div>
                            <dt className="mb-1 text-[10.5px] font-medium text-muted-foreground">Friends since</dt>
                            <dd className={cn("min-w-0 font-mono text-[11px] text-foreground", machineTextClass)}>{vm.friendsSince}</dd>
                        </div>
                        <div>
                            <dt className="mb-1 text-[10.5px] font-medium text-muted-foreground">Local time</dt>
                            <dd className="min-w-0 text-[13px] text-foreground">—</dd>
                        </div>
                    </dl>
                </div>

                <div
                    aria-hidden
                    className={cn(
                        "col-span-full overflow-hidden whitespace-nowrap border-t border-line bg-surf px-7 py-3 font-mono text-[11.5px] leading-[1.7] tracking-[0.3em] text-muted-foreground max-[720px]:hidden",
                        machineTextClass,
                    )}
                >
                    <div>{vm.mrz[0]}</div>
                    <div>{vm.mrz[1]}</div>
                </div>
            </div>
        </div>
    )
}
