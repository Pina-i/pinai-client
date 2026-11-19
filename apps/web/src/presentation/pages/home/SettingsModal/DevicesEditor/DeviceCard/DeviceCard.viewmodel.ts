import { type RefObject, useEffect, useRef, useState } from "react"

import { cutDeviceName, deviceRename } from "@pinai/domain/models/device"
import type { DeviceRow } from "@/presentation/hooks/useDevices"

export const RENAME_FAILED = "Couldn't rename this device — try again."
export const NAME_REFUSED = "That name can't be used."

/**
 * How a rename went: `renamed` once the list shows the name; `withdrawn` when there is nothing left
 * to rename here (refused for approval, the device revoked or gone — the list read again says it);
 * `invalid`, a name the IdP won't take; `failed`, anything else.
 */
export type RenameOutcome = "renamed" | "withdrawn" | "invalid" | "failed"
export type RenameDevice = (name: string | null) => Promise<RenameOutcome>

export interface DeviceCardViewModel {
    isEditing: boolean
    draft: string
    setDraft: (value: string) => void
    isSaving: boolean
    /** Under the field while it stays: why the last save didn't go. */
    failure: string | null
    startRename: () => void
    cancelRename: () => void
    saveRename: () => Promise<void>
    /** Where the focus comes back after a save or a cancel. */
    pencilRef: RefObject<HTMLButtonElement | null>
    /** Where it goes when the rename is withdrawn: the pencil may go with it. */
    nameRef: RefObject<HTMLSpanElement | null>
}

/** The card's name, renamed in place; without `onRename` (revoked, or Revoke's rule refusing) there is nothing to rename. */
export function useDeviceCardViewModel(device: DeviceRow, onRename: RenameDevice | undefined): DeviceCardViewModel {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const [failure, setFailure] = useState<string | null>(null)
    const pencilRef = useRef<HTMLButtonElement | null>(null)
    const nameRef = useRef<HTMLSpanElement | null>(null)
    const focusAfter = useRef<"pencil" | "name" | null>(null)

    // Withdrawn meanwhile (a recount, a revoke elsewhere): the edit goes, so the pencil coming back opens nothing.
    if (!onRename && (editing || failure !== null)) {
        setEditing(false)
        setFailure(null)
    }
    const isEditing = editing && onRename !== undefined

    useEffect(() => {
        if (isEditing || focusAfter.current === null) return
        const target = focusAfter.current === "name" ? nameRef.current : pencilRef.current
        focusAfter.current = null
        target?.focus()
    }, [isEditing])

    const close = (focus: "pencil" | "name") => {
        focusAfter.current = focus
        setEditing(false)
        setFailure(null)
    }

    return {
        isEditing,
        draft,
        setDraft,
        isSaving,
        failure: isEditing ? failure : null,
        startRename: () => {
            // Over the limit (an automatic name, up to 100): empty, the automatic name its placeholder.
            setDraft(cutDeviceName(device.display_name) === device.display_name ? device.display_name : "")
            setFailure(null)
            setEditing(true)
        },
        cancelRename: () => {
            if (!isSaving) close("pencil")
        },
        saveRename: async () => {
            if (!onRename || isSaving) return
            const change = deviceRename(draft, device)
            if (!change) return close("pencil")
            if ("refused" in change) return setFailure(NAME_REFUSED)
            setIsSaving(true)
            setFailure(null)
            const outcome = await onRename(change.name).catch((): RenameOutcome => "failed")
            setIsSaving(false)
            if (outcome === "renamed") close("pencil")
            else if (outcome === "withdrawn") close("name")
            else setFailure(outcome === "invalid" ? NAME_REFUSED : RENAME_FAILED)
        },
        pencilRef,
        nameRef,
    }
}
