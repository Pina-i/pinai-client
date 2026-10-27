import { Mail } from "lucide-react"
import type { Ref } from "react"

import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

import { pill } from "../../editor-styles"
import type { PendingInvitation } from "../InstanceEditor.viewmodel"
import { dashedAvatar, rosterLine, rosterName, rosterRow, rosterText } from "../roster-styles"

interface PendingInvitationRowProps {
    invitation: PendingInvitation
    isRevoking: boolean
    onRevoke: () => void
    revokeRef?: Ref<HTMLButtonElement>
}

/** An invitation nobody used yet: a seat still empty. Its link was shown once, when it was made. */
export function PendingInvitationRow({ invitation, isRevoking, onRevoke, revokeRef }: PendingInvitationRowProps) {
    return (
        <div className={rosterRow({ dashed: true })}>
            <span className={dashedAvatar}>
                <Mail className="h-[13px] w-[13px]" aria-hidden />
            </span>
            <span className={rosterText}>
                <span className={cn(rosterName, "text-muted-foreground")}>Invitation</span>
                <small className={rosterLine}>
                    {invitation.expires ? `${invitation.made} · ${invitation.expires}` : invitation.made}
                </small>
            </span>
            <IconButton
                ref={revokeRef}
                onPress={onRevoke}
                isDisabled={isRevoking}
                aria-label={`Revoke the invitation ${invitation.made}`}
                className={pill({ variant: "revoke" })}
            >
                {isRevoking ? "Revoking…" : "Revoke"}
            </IconButton>
        </div>
    )
}
