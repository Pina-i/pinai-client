import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { toast } from "sonner"
import type { Pronouns, UserProfile } from "@pinai/domain/models/auth"
import { readableName } from "@pinai/domain/models/name"
import { MAX_DISPLAY_NAME_LENGTH, displayNameToSave } from "@pinai/domain/models/profile"
import { getUserPort } from "@/ioc"
import { uploadAvatarUseCase } from "@pinai/domain/usecases/user/upload-avatar.usecase"
import { blobToLocalFile } from "@/presentation/_libs/local-file"
import { deleteAvatarUseCase } from "@pinai/domain/usecases/user/delete-avatar.usecase"
import { updateProfileUseCase } from "@pinai/domain/usecases/user/update-profile.usecase"
import { useAppStore } from "@/store/store"

const BIO_MAX = 190
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MiB before crop (server caps post-crop at 2 MiB)
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

/** UI options for the pronouns select. The empty string maps to `null` server-side. */
export const PRONOUN_OPTIONS: ReadonlyArray<{ value: "" | Pronouns; label: string }> = [
    { value: "", label: "Prefer not to say" },
    { value: "he", label: "he / him" },
    { value: "she", label: "she / her" },
    { value: "non-binary", label: "non-binary" },
]

export interface ProfileDraft {
    displayName: string
    pronouns: "" | Pronouns
    bio: string
}

export interface ProfileEditorViewModel {
    draft: ProfileDraft
    initial: ProfileDraft
    isDirty: boolean
    isSaving: boolean
    bioCount: number
    bioMax: number
    displayNameMax: number
    setDisplayName: (v: string) => void
    setPronouns: (v: "" | Pronouns) => void
    setBio: (v: string) => void
    reset: () => void
    save: () => Promise<void>
    // Avatar
    avatarUrl: string | null
    fileInputRef: React.RefObject<HTMLInputElement | null>
    pickedFile: File | null
    isCropOpen: boolean
    isAvatarBusy: boolean
    onPickAvatarClick: () => void
    onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
    onCropSave: (blob: Blob) => Promise<void>
    onCropClose: () => void
    onRemoveAvatar: () => Promise<void>
}

function draftOf(profile: UserProfile): ProfileDraft {
    return {
        displayName: profile.display_name ?? profile.preferred_username,
        pronouns: (profile.pronouns ?? "") as "" | Pronouns,
        bio: profile.bio ?? "",
    }
}

export function useProfileEditorViewModel(user: UserProfile): ProfileEditorViewModel {
    const initial = useMemo(() => draftOf(user), [user])

    const [displayName, setDisplayName] = useState(initial.displayName)
    const [pronouns, setPronouns] = useState<"" | Pronouns>(initial.pronouns)
    const [bio, setBio] = useState(initial.bio)
    const [isSaving, setIsSaving] = useState(false)

    const draft: ProfileDraft = { displayName, pronouns, bio }
    // As saved: an invisible character or a space at the end changes nothing.
    const isDirty =
        readableName(draft.displayName) !== readableName(initial.displayName) ||
        draft.pronouns !== initial.pronouns ||
        draft.bio !== initial.bio

    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const setUser = useAppStore((s) => s.setUser)
    const setAvatarUrl = useAppStore((s) => s.setAvatarUrl)
    const storedAvatarUrl = useAppStore((s) => s.user?.avatar_url ?? null)

    function show(next: ProfileDraft) {
        setDisplayName(next.displayName)
        setPronouns(next.pronouns)
        setBio(next.bio)
    }

    function reset() {
        show(initial)
    }

    async function save() {
        if (!accessToken || !idpUrl) {
            toast.error("Not signed in.")
            return
        }
        const toSave = displayNameToSave(draft.displayName)
        if ("refused" in toSave) {
            toast.error(
                toSave.refused === "blank"
                    ? "Display name cannot be blank."
                    : `Display name must be ≤ ${MAX_DISPLAY_NAME_LENGTH} characters.`,
            )
            return
        }

        setIsSaving(true)
        try {
            const saved = await updateProfileUseCase(getUserPort(), {
                idpUrl,
                accessToken,
                patch: {
                    display_name: toSave.name,
                    pronouns: draft.pronouns === "" ? null : draft.pronouns,
                    bio: draft.bio,
                },
                setUser,
            })
            show(draftOf(saved))
            toast.success("Profile saved.")
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save profile.")
        } finally {
            setIsSaving(false)
        }
    }

    // ── Avatar ───────────────────────────────────────────────────────────
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const [pickedFile, setPickedFile] = useState<File | null>(null)
    const [isCropOpen, setIsCropOpen] = useState(false)
    const [isAvatarBusy, setIsAvatarBusy] = useState(false)

    function onPickAvatarClick() {
        fileInputRef.current?.click()
    }

    function onFileChange(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        // Reset so the same file can be re-picked
        e.target.value = ""
        if (!file) return
        if (!ACCEPTED_TYPES.includes(file.type)) {
            toast.error("Unsupported image type. Use JPG, PNG, WebP or GIF.")
            return
        }
        if (file.size > MAX_FILE_SIZE) {
            toast.error("Image is too large. Max 20 MB.")
            return
        }
        setPickedFile(file)
        setIsCropOpen(true)
    }

    async function onCropSave(blob: Blob) {
        if (!accessToken || !idpUrl) {
            toast.error("Not signed in.")
            return
        }
        setIsAvatarBusy(true)
        try {
            await uploadAvatarUseCase(getUserPort(), {
                idpUrl,
                accessToken,
                avatar: await blobToLocalFile(blob, "avatar.jpg"),
                setAvatarUrl,
            })
            toast.success("Avatar updated.")
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to upload avatar.")
        } finally {
            setIsAvatarBusy(false)
        }
    }

    function onCropClose() {
        setIsCropOpen(false)
        setPickedFile(null)
    }

    async function onRemoveAvatar() {
        if (!accessToken || !idpUrl) return
        setIsAvatarBusy(true)
        try {
            await deleteAvatarUseCase(getUserPort(), {
                idpUrl,
                accessToken,
                setAvatarUrl,
            })
            toast.success("Avatar removed.")
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to remove avatar.")
        } finally {
            setIsAvatarBusy(false)
        }
    }

    return {
        draft,
        initial,
        isDirty,
        isSaving,
        bioCount: bio.length,
        bioMax: BIO_MAX,
        displayNameMax: MAX_DISPLAY_NAME_LENGTH,
        setDisplayName,
        setPronouns,
        setBio: (v) => setBio(v.slice(0, BIO_MAX)),
        reset,
        save,
        avatarUrl: storedAvatarUrl,
        fileInputRef,
        pickedFile,
        isCropOpen,
        isAvatarBusy,
        onPickAvatarClick,
        onFileChange,
        onCropSave,
        onCropClose,
        onRemoveAvatar,
    }
}
