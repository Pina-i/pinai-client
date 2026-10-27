import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocation } from "@tanstack/react-router"
import { useCallback, useReducer, useState } from "react"
import { toast } from "sonner"

import {
    type InstanceMember,
    type IssuedLink,
    memberActivity,
    offersPasswordReset,
    type OpenInvitation,
    refusedAsNonAdmin,
} from "@pinai/domain/models/instance-admin"
import { expiryWording, formatLastSeen } from "@pinai/domain/models/relative-time"
import { revokeInvitationUseCase } from "@pinai/domain/usecases/instance/revoke-invitation.usecase"
import { getInstanceAdminPort } from "@/ioc"
import { type RecentSignIn, useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

import { settingsHref } from "../SettingsModal.viewmodel"

/** The row that is open: "Invite someone", or a member's "Reset password". */
export type OpenRow = { kind: "invite" } | { kind: "reset"; memberId: string }

export interface RosterState {
    open: OpenRow | null
    /** The link made in the open row. Its token is in this state only: once the row closes, it is gone. */
    issued: IssuedLink | null
}

export type RosterAction =
    | { type: "toggle"; row: OpenRow }
    | { type: "close" }
    | { type: "issued"; row: OpenRow; link: IssuedLink }

export const CLOSED: RosterState = { open: null, issued: null }

export function sameRow(a: OpenRow | null, b: OpenRow | null): boolean {
    if (a === null || b === null) return false
    return a.kind === "invite" ? b.kind === "invite" : b.kind === "reset" && a.memberId === b.memberId
}

export function rosterReducer(state: RosterState, action: RosterAction): RosterState {
    switch (action.type) {
        case "toggle":
            return sameRow(state.open, action.row) ? CLOSED : { open: action.row, issued: null }
        case "close":
            return CLOSED
        case "issued":
            // Answered after its row was closed: the link goes with it.
            return sameRow(state.open, action.row) ? { open: action.row, issued: action.link } : state
    }
}

const NUMBER_WORDS = [
    "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
    "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
]

/** "Nine people, and room for more."; the admin reading it is the one member of a new instance. */
export function rosterTitle(members: number | null): string {
    if (members === null) return "Who's here."
    if (members <= 1) return "Just you, and room for more."
    return `${NUMBER_WORDS[members - 2] ?? members.toLocaleString("en")} people, and room for more.`
}

export interface RosterMember {
    id: string
    name: string
    initials: string
    admin: boolean
    isYou: boolean
    /** "online", "seen 3 days ago", "signed out". */
    activity: string
    online: boolean
    canReset: boolean
}

export interface PendingInvitation {
    id: string
    /** "made by Hōkū yesterday". */
    made: string
    /** "expires in 6 days", "expired"; `null` when the IdP's date can't be read. */
    expires: string | null
}

// The IdP leaves the name out only for an account that has none; it never gives a handle to fall back on.
const nameOf = (displayName: string | null, fallback: string) => displayName?.trim() || fallback

export function rosterMember(member: InstanceMember, me: string | null, now: Date): RosterMember {
    const name = nameOf(member.display_name, "Unnamed")
    const activity = memberActivity(member)
    const seen = activity.kind === "seen" ? formatLastSeen(activity.at, now) : null
    return {
        id: member.id,
        name,
        initials: name.slice(0, 2).toUpperCase(),
        admin: member.admin,
        isYou: member.id === me,
        activity:
            activity.kind === "online"
                ? "online"
                : activity.kind === "signed-out"
                  ? "signed out"
                  : seen
                    ? `seen ${seen}`
                    : "signed in",
        online: activity.kind === "online",
        canReset: offersPasswordReset(member),
    }
}

export function pendingInvitation(invitation: OpenInvitation, now: Date): PendingInvitation {
    const made = formatLastSeen(invitation.created_at, now)
    const by = nameOf(invitation.created_by.display_name, "an admin")
    return {
        id: invitation.id,
        made: made ? `made by ${by} ${made}` : `made by ${by}`,
        expires: expiryWording(invitation.expires_at, now),
    }
}

export interface InstanceEditorViewModel {
    title: string
    members: RosterMember[] | undefined
    invitations: PendingInvitation[] | undefined
    isLoading: boolean
    loadFailed: boolean
    retry: () => void
    /** The IdP refused this account as no admin (any more). */
    noLongerAdmin: boolean

    roster: RosterState
    toggle: (row: OpenRow) => void
    close: () => void
    /** That row's link is being made. */
    isIssuing: (row: OpenRow) => boolean
    createInvitation: () => Promise<void>
    issueReset: (member: RosterMember) => Promise<void>
    isRevoking: (invitationId: string) => boolean
    /** True once the invitation is off the list: revoked, or gone already. */
    revoke: (invitationId: string) => Promise<boolean>

    copiedLink: string | null
    copy: (link: string) => Promise<void>

    /** Issuing a reset link takes a recent password. */
    recentSignIn: RecentSignIn
}

const COPIED_MS = 1_600

const adminQueryKey = (idpUrl: string | null, list: "members" | "invitations") => ["instance-admin", idpUrl, list] as const

export function useInstanceEditorViewModel(): InstanceEditorViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const me = useAppStore((s) => s.user?.sub ?? null)
    const queryClient = useQueryClient()
    const location = useLocation()
    const recentSignIn = useRecentSignIn(useCallback(() => settingsHref(location, "instance"), [location]))
    const { refused } = recentSignIn

    const [roster, dispatch] = useReducer(rosterReducer, CLOSED)
    // Every row whose link is being made: one may wait for its answer while another row is opened.
    const [issuing, setIssuing] = useState<readonly OpenRow[]>([])
    const [revoking, setRevoking] = useState<ReadonlySet<string>>(new Set())
    const [copiedLink, setCopiedLink] = useState<string | null>(null)
    const [demoted, setDemoted] = useState(false)

    const enabled = idpUrl !== null && signedIn
    const retry = (failures: number, error: unknown) => !refusedAsNonAdmin(error) && failures < 3
    const membersQuery = useQuery({
        queryKey: adminQueryKey(idpUrl, "members"),
        queryFn: () => getInstanceAdminPort().listMembers(idpUrl!, useAppStore.getState().accessToken!),
        enabled,
        retry,
    })
    const invitationsQuery = useQuery({
        queryKey: adminQueryKey(idpUrl, "invitations"),
        queryFn: () => getInstanceAdminPort().listInvitations(idpUrl!, useAppStore.getState().accessToken!),
        enabled,
        retry,
    })

    const now = new Date()
    const members = membersQuery.data?.map((member) => rosterMember(member, me, now))
    const invitations = invitationsQuery.data?.map((invitation) => pendingInvitation(invitation, now))
    const errors = [membersQuery.error, invitationsQuery.error].filter((e) => e !== null)
    const noLongerAdmin = demoted || errors.some(refusedAsNonAdmin)

    const toggle = useCallback((row: OpenRow) => dispatch({ type: "toggle", row }), [])
    const close = useCallback(() => dispatch({ type: "close" }), [])

    const failed = useCallback((e: unknown, fallback: string) => {
        if (refusedAsNonAdmin(e)) setDemoted(true)
        else toast.error(e instanceof Error ? e.message : fallback)
    }, [])

    const doneIssuing = useCallback((row: OpenRow) => setIssuing((rows) => rows.filter((r) => !sameRow(r, row))), [])

    const createInvitation = useCallback(async () => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken) return
        const row: OpenRow = { kind: "invite" }
        setIssuing((rows) => [...rows, row])
        try {
            const { link, expires_at } = await getInstanceAdminPort().createInvitation(idpUrl, accessToken)
            dispatch({ type: "issued", row, link: { link, expires_at } })
        } catch (e) {
            failed(e, "Could not create the invitation")
            return
        } finally {
            doneIssuing(row)
        }
        void queryClient.invalidateQueries({ queryKey: adminQueryKey(idpUrl, "invitations") })
    }, [idpUrl, queryClient, failed, doneIssuing])

    const issueReset = useCallback(
        async (member: RosterMember) => {
            const accessToken = useAppStore.getState().accessToken
            if (!idpUrl || !accessToken) return
            const row: OpenRow = { kind: "reset", memberId: member.id }
            setIssuing((rows) => [...rows, row])
            try {
                const link = await getInstanceAdminPort().issuePasswordReset(idpUrl, accessToken, member.id)
                dispatch({ type: "issued", row, link })
            } catch (e) {
                if (refused(e, `make a reset link for ${member.name}`)) return
                failed(e, "Could not create the reset link")
            } finally {
                doneIssuing(row)
            }
        },
        [idpUrl, refused, failed, doneIssuing],
    )

    const revoke = useCallback(
        async (invitationId: string) => {
            const accessToken = useAppStore.getState().accessToken
            if (!idpUrl || !accessToken) return false
            setRevoking((ids) => new Set(ids).add(invitationId))
            try {
                const outcome = await revokeInvitationUseCase(idpUrl, accessToken, invitationId, getInstanceAdminPort())
                if (outcome === "revoked") toast.success("Invitation revoked")
                const key = adminQueryKey(idpUrl, "invitations")
                queryClient.setQueryData<OpenInvitation[]>(key, (list) => list?.filter((i) => i.id !== invitationId))
                void queryClient.invalidateQueries({ queryKey: key })
                return true
            } catch (e) {
                failed(e, "Could not revoke the invitation")
                return false
            } finally {
                setRevoking((ids) => {
                    const left = new Set(ids)
                    left.delete(invitationId)
                    return left
                })
            }
        },
        [idpUrl, queryClient, failed],
    )

    const copy = useCallback(async (link: string) => {
        try {
            await navigator.clipboard.writeText(link)
            setCopiedLink(link)
            window.setTimeout(() => setCopiedLink((current) => (current === link ? null : current)), COPIED_MS)
        } catch {
            toast.error("Could not copy the link: select it and copy it")
        }
    }, [])

    return {
        title: rosterTitle(members?.length ?? null),
        members,
        invitations,
        isLoading: membersQuery.isLoading || invitationsQuery.isLoading,
        loadFailed: errors.length > 0 && !noLongerAdmin,
        retry: () => {
            void membersQuery.refetch()
            void invitationsQuery.refetch()
        },
        noLongerAdmin,
        roster,
        toggle,
        close,
        isIssuing: (row) => issuing.some((r) => sameRow(r, row)),
        createInvitation,
        issueReset,
        isRevoking: (invitationId) => revoking.has(invitationId),
        revoke,
        copiedLink,
        copy,
        recentSignIn,
    }
}
