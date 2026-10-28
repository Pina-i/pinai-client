import { ChevronDown, ChevronUp, Plus } from "lucide-react"
import { useId, useRef } from "react"

import type { InstanceInfo } from "@pinai/domain/models/instance"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { RecentSignInModal } from "@/presentation/molecules/RecentSignInModal/RecentSignInModal"
import { cn } from "@/presentation/_libs/utils"

import { editorFrame, editorTitle, pill } from "../editor-styles"
import { useInstanceEditorViewModel } from "./InstanceEditor.viewmodel"
import { IntroForm } from "./IntroForm/IntroForm"
import { MemberRow } from "./MemberRow/MemberRow"
import { OneTimeLink } from "./OneTimeLink/OneTimeLink"
import { PendingInvitationRow } from "./PendingInvitationRow/PendingInvitationRow"
import { dashedAvatar, expansion, expansionText, rosterLine, rosterName, rosterRow, rosterText } from "./roster-styles"

const statePanel =
    "mt-2 rounded-[14px] border border-dashed border-line2 bg-[color-mix(in_oklab,var(--surf)_50%,transparent)] px-3.5 py-6 text-center title text-[12px] italic text-muted-foreground"

const list = "m-0 flex list-none flex-col gap-0.5 p-0"

const failurePanel =
    "mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[color-mix(in_oklab,var(--dnd)_40%,transparent)] bg-[color-mix(in_oklab,var(--dnd)_10%,transparent)] px-3.5 py-3 text-[12px] text-dnd"

interface InstanceEditorProps {
    /** The instance's domain, as its members' addresses carry it. */
    host: string
    /** What its NodeInfo says: whether it is invite-only, how many people it counts. */
    info: InstanceInfo
}

export function InstanceEditor({ host, info }: InstanceEditorProps) {
    const vm = useInstanceEditorViewModel(host, info)
    const inviteRef = useRef<HTMLButtonElement>(null)
    const revokeRefs = useRef(new Map<string, HTMLButtonElement>())
    const invitePanelId = useId()
    const { open, issued } = vm.roster
    const inviteRow = { kind: "invite" } as const
    const inviteOpen = open?.kind === "invite"

    function inviteDone() {
        vm.close()
        inviteRef.current?.focus()
    }

    // The focused Revoke goes with its row: the next one takes the focus, else "Invite someone".
    async function revoke(invitationId: string) {
        const pending = vm.invitations ?? []
        const next = pending[pending.findIndex((i) => i.id === invitationId) + 1]?.id
        if (!(await vm.revoke(invitationId))) return
        const target = next === undefined ? undefined : revokeRefs.current.get(next)
        ;(target && !target.disabled ? target : inviteRef.current)?.focus()
    }

    return (
        <div className={cn(editorFrame, "@container")}>
            <p className="mono-eyebrow mb-[5px]">— Instance · {host}</p>
            <h2 className={editorTitle}>{vm.noLongerAdmin ? "Not yours to run any more." : vm.title}</h2>

            {vm.noLongerAdmin ? (
                <div className={cn(failurePanel, "mt-[18px]")}>
                    Only the admins of {host} {vm.hasRoster ? "see its members and invitations" : "change how it introduces itself"},
                    and this account is no longer one.
                </div>
            ) : vm.intro.saved ? (
                <IntroForm intro={vm.intro} />
            ) : vm.intro.loadFailed ? (
                <div className={cn(failurePanel, "mt-[26px]")}>
                    <span>Could not load the name and description.</span>
                    <IconButton onPress={vm.intro.retry} className={pill({ variant: "outline" })}>
                        Try again
                    </IconButton>
                </div>
            ) : (
                <div role="status" className={cn(statePanel, "mt-[26px]")}>
                    Loading the name and description…
                </div>
            )}

            {!vm.noLongerAdmin && !vm.hasRoster && (
                <p className="fact fact-plain mt-[22px]">
                    registration is open · no invitations or reset links to manage — people reset their own passwords
                    from the sign-in page
                </p>
            )}

            {!vm.noLongerAdmin && vm.hasRoster && (
                <div className="flex flex-col gap-0.5">
                    <h3 className="eye mb-1.5 mt-[26px]">People</h3>
                    <div>
                        <IconButton
                            ref={inviteRef}
                            onPress={() => vm.toggle(inviteRow)}
                            aria-expanded={inviteOpen}
                            aria-controls={inviteOpen ? invitePanelId : undefined}
                            className={rosterRow({ open: inviteOpen, dashed: true, className: "w-full justify-start text-left" })}
                        >
                            <span className={dashedAvatar}>
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                            </span>
                            <span className={rosterText}>
                                <span className={cn(rosterName, "text-muted-foreground")}>Invite someone</span>
                                <small className={rosterLine}>make a link that creates one account</small>
                            </span>
                            {inviteOpen ? (
                                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                            ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                            )}
                        </IconButton>
                        {inviteOpen && (
                            <div id={invitePanelId} className={expansion}>
                                {issued ? (
                                    <>
                                        <OneTimeLink
                                            link={issued.link}
                                            copied={vm.copiedLink === issued.link}
                                            onCopy={() => void vm.copy(issued.link)}
                                        />
                                        <p className="fact fact-plain">
                                            one account · it sits below as a pending seat until someone uses it
                                        </p>
                                        <IconButton onPress={inviteDone} className={pill({ variant: "bare", className: "self-start" })}>
                                            Done
                                        </IconButton>
                                    </>
                                ) : (
                                    <>
                                        <p className={expansionText}>
                                            A link that lets one person create an account on {host}. Paste it wherever you
                                            already talk to them.
                                        </p>
                                        <div className="flex justify-end">
                                            <IconButton
                                                onPress={() => void vm.createInvitation()}
                                                isDisabled={vm.isIssuing(inviteRow)}
                                                className={pill({ variant: "save" })}
                                            >
                                                {vm.isIssuing(inviteRow) ? "Creating…" : "Create invitation link"}
                                            </IconButton>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {vm.isLoading && (
                        <div role="status" className={statePanel}>
                            Loading the members…
                        </div>
                    )}

                    {vm.loadFailed && (
                        <div className={failurePanel}>
                            <span>Could not load the members and invitations.</span>
                            <IconButton onPress={vm.retry} className={pill({ variant: "outline" })}>
                                Try again
                            </IconButton>
                        </div>
                    )}

                    {vm.members && (
                        <ul aria-label="Members" className={list}>
                            {vm.members.map((member) => {
                                const row = { kind: "reset", memberId: member.id } as const
                                const isOpen = open?.kind === "reset" && open.memberId === member.id
                                const link = isOpen ? issued : null
                                return (
                                    <li key={member.id}>
                                        <MemberRow
                                            member={member}
                                            isOpen={isOpen}
                                            issued={link}
                                            isIssuing={vm.isIssuing(row)}
                                            copied={link !== null && vm.copiedLink === link.link}
                                            onToggle={() => vm.toggle(row)}
                                            onIssue={() => void vm.issueReset(member)}
                                            onClose={vm.close}
                                            onCopy={(l) => void vm.copy(l)}
                                        />
                                    </li>
                                )
                            })}
                        </ul>
                    )}

                    {vm.invitations && vm.invitations.length > 0 && (
                        <ul aria-label="Pending invitations" className={list}>
                            {vm.invitations.map((invitation) => (
                                <li key={invitation.id}>
                                    <PendingInvitationRow
                                        invitation={invitation}
                                        isRevoking={vm.isRevoking(invitation.id)}
                                        onRevoke={() => void revoke(invitation.id)}
                                        revokeRef={(button) => {
                                            if (button) revokeRefs.current.set(invitation.id, button)
                                            else revokeRefs.current.delete(invitation.id)
                                        }}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <RecentSignInModal
                action={vm.recentSignIn.asking}
                host={vm.recentSignIn.host}
                isLeaving={vm.recentSignIn.isLeaving}
                onCancel={vm.recentSignIn.dismiss}
                onContinue={vm.recentSignIn.signInAgain}
            />
        </div>
    )
}
