import { KeyRound, TriangleAlert } from "lucide-react"
import { useRef } from "react"

import type { IssuedLink } from "@pinai/domain/models/instance-admin"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

import { pill } from "../../editor-styles"
import type { RosterMember } from "../InstanceEditor.viewmodel"
import { OneTimeLink } from "../OneTimeLink/OneTimeLink"
import {
    actionLabel,
    expansion,
    expansionText,
    revealed,
    rosterLine,
    rosterName,
    rosterRow,
    rosterText,
} from "../roster-styles"

interface MemberRowProps {
    member: RosterMember
    isOpen: boolean
    /** The reset link made for this member, while their row stays open. */
    issued: IssuedLink | null
    isIssuing: boolean
    copied: boolean
    onToggle: () => void
    onIssue: () => void
    onClose: () => void
    onCopy: (link: string) => void
}

export function MemberRow({ member, isOpen, issued, isIssuing, copied, onToggle, onIssue, onClose, onCopy }: MemberRowProps) {
    const toggleRef = useRef<HTMLButtonElement>(null)
    const panelId = `instance-reset-${member.id}`
    const { name } = member

    function done() {
        onClose()
        toggleRef.current?.focus()
    }

    return (
        <>
            <div className={rosterRow({ open: isOpen })}>
                <Avatar initials={member.initials} seed={member.id} size="sm" />
                <span className={rosterText}>
                    <span className={rosterName}>
                        <span className="truncate">{name}</span>
                        {member.admin && (
                            <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-sec-soft px-[7px] font-mono text-[9.5px] uppercase tracking-[0.08em] text-foreground">
                                admin
                            </span>
                        )}
                    </span>
                    <small className={cn(rosterLine, member.online && "text-on")}>{member.activity}</small>
                </span>
                {member.canReset ? (
                    <IconButton
                        ref={toggleRef}
                        onPress={onToggle}
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? panelId : undefined}
                        aria-label={`Reset password for ${name}`}
                        className={pill({ variant: "outline", className: cn("gap-1.5", revealed({ open: isOpen })) })}
                    >
                        <KeyRound className="h-3 w-3" aria-hidden />
                        <span className={actionLabel}>Reset password</span>
                    </IconButton>
                ) : (
                    member.isYou && <span className="fact fact-plain">you</span>
                )}
            </div>
            {isOpen && (
                <div id={panelId} className={expansion}>
                    {issued ? (
                        <>
                            <OneTimeLink link={issued.link} copied={copied} onCopy={() => onCopy(issued.link)} />
                            <div className="flex items-start gap-[9px] rounded-[12px] border border-[color-mix(in_oklab,var(--idle)_30%,transparent)] bg-[color-mix(in_oklab,var(--idle)_9%,transparent)] px-3 py-2.5 text-[12px] leading-[1.5] text-foreground">
                                <TriangleAlert className="mt-0.5 h-[13px] w-[13px] shrink-0 text-idle" aria-hidden />
                                <span>
                                    Whoever holds this link can set a new password for {name}. Send it over a channel you
                                    trust; it works once.
                                </span>
                            </div>
                            <IconButton onPress={done} className={pill({ variant: "bare", className: "self-start" })}>
                                Done
                            </IconButton>
                        </>
                    ) : (
                        <>
                            <p className={expansionText}>
                                A link that lets whoever holds it set a new password for {name}. Works once. {name}'s
                                devices stay signed in until the password changes.
                            </p>
                            <div className="flex flex-wrap justify-end gap-2">
                                <IconButton onPress={done} className={pill({ variant: "bare" })}>
                                    Cancel
                                </IconButton>
                                <IconButton onPress={onIssue} isDisabled={isIssuing} className={pill({ variant: "save" })}>
                                    {isIssuing ? "Creating…" : `Create reset link for ${name}`}
                                </IconButton>
                            </div>
                        </>
                    )}
                </div>
            )}
        </>
    )
}
