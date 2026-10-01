import { useState } from "react"
import { addressParts } from "@pinai/domain/models/identity"
import { presenceToUserStatus, userStatusLabel } from "@pinai/domain/models/presence"
import { useAppStore } from "@/store/store"
import { useIsFriend } from "@/presentation/hooks/useRemoveFriend"
import { avatarToneFor, TONE_FILL, TONE_INK } from "@/presentation/_libs/avatar-tone"
import { passportMrz } from "./_helpers/passport-mrz.helper"

export interface ProfilePerson {
    actorUri: string
    address: string
    displayName: string
    avatarUrl: string | null
}

const HANDLE_COPIED_MS = 1400

export function usePersonProfileModalViewModel(person: ProfilePerson) {
    const myAddress = useAppStore((s) => s.user?.address ?? "")
    const presence = useAppStore((s) => s.presenceByAddress[person.address])
    const cachedAvatarUrl = useAppStore((s) => s.avatarsByAddress[person.address] ?? null)
    const isFriend = useIsFriend(person.actorUri)
    const [isHandleCopied, setIsHandleCopied] = useState(false)

    const { host } = addressParts(person.address)
    const isLocal = host === addressParts(myAddress).host
    const status = presenceToUserStatus(presence)
    const tone = avatarToneFor(person.address)
    // A neutral tone would leave the photo grey on grey, so its side panel takes the muted ink instead.
    const isNeutral = tone === "neutral"

    function copyHandle() {
        navigator.clipboard.writeText(person.address).catch(() => {})
        setIsHandleCopied(true)
        window.setTimeout(() => setIsHandleCopied(false), HANDLE_COPIED_MS)
    }

    return {
        // As the DM row and the user bar spell them, so the photo matches the row it was opened from.
        initials: person.displayName.slice(0, 2).toUpperCase(),
        avatarUrl: person.avatarUrl ?? cachedAvatarUrl,
        status,
        presenceLabel: userStatusLabel(status),
        sideFill: isNeutral ? "var(--muted-foreground)" : TONE_FILL[tone],
        sideInk: isNeutral ? "var(--background)" : TONE_INK[tone],
        photoFill: TONE_FILL[tone],
        photoInk: TONE_INK[tone],
        identityLabel: `Pīna'i identity · ${isLocal ? "local" : "federated"}`,
        homeServer: isLocal ? "Same as yours" : host,
        friendsSince: isFriend ? "—" : "Not friends",
        mrz: passportMrz(person.displayName, person.address),
        isHandleCopied,
        copyHandle,
    }
}
