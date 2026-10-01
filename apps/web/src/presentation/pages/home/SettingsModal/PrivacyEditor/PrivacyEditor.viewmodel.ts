import { useState } from "react"
import { toast } from "sonner"
import { getPrivacyPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import type { ContactPolicy } from "@pinai/domain/models/block"
import { setContactPolicyUseCase } from "@pinai/domain/usecases/privacy/set-contact-policy.usecase"
import { blockedPeople } from "@/presentation/molecules/BlockedPersonRow/blocked-person.helper"
import { useBlockUser, useBlocks } from "@/presentation/hooks/useBlocks"

export const CONTACT_POLICY_CHOICES: readonly { value: ContactPolicy; label: string; description: string }[] = [
    { value: "everyone", label: "Everyone", description: "Anyone with your address can message you or add you to a group." },
    {
        value: "friends_and_groups",
        label: "Friends and groups",
        description: "Your friends, and people you're in a group with.",
    },
    { value: "friends", label: "Friends only", description: "Only your friends." },
]

/** What the IdP applies when the account never chose. */
export const DEFAULT_CONTACT_POLICY: ContactPolicy = "friends_and_groups"

export function usePrivacyEditorViewModel() {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const user = useAppStore((s) => s.user)
    const setUser = useAppStore((s) => s.setUser)
    const { blocks, isLoading } = useBlocks()
    const { unblock, isPending: isUnblocking } = useBlockUser()
    const [isSaving, setIsSaving] = useState(false)

    const contactPolicy = user?.privacy?.contact_policy ?? DEFAULT_CONTACT_POLICY

    async function chooseContactPolicy(policy: ContactPolicy) {
        if (!accessToken || !idpUrl || !user || policy === contactPolicy) return
        setIsSaving(true)
        try {
            const saved = await setContactPolicyUseCase(idpUrl, accessToken, policy, getPrivacyPort())
            setUser({ ...user, privacy: { contact_policy: saved } })
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong")
        } finally {
            setIsSaving(false)
        }
    }

    return {
        contactPolicy,
        chooseContactPolicy,
        isSaving,
        blocked: blockedPeople(blocks),
        isLoadingBlocks: isLoading,
        unblock,
        isUnblocking,
    }
}
