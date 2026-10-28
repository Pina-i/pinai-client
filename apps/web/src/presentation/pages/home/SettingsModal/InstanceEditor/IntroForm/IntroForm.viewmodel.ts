import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { type InstanceInfo, peopleCount } from "@pinai/domain/models/instance"
import {
    INTRO_LIMITS,
    type InstanceIntro,
    introDraft,
    type IntroField,
    introPreview,
    type IntroPreview,
    refusedAsNonAdmin,
} from "@pinai/domain/models/instance-admin"
import { getInstanceAdminPort } from "@/ioc"
import { useAppStore } from "@/store/store"

import { adminQueryKey, retryUnlessRefused } from "../admin-queries"

interface Fields {
    name: string
    description: string
}

/** The sign-in pages' left column, as the draft would make it. */
export interface SignInPreview extends IntroPreview {
    host: string
    /** "9 people"; `null` when NodeInfo doesn't say. */
    people: string | null
    open: boolean
}

export interface IntroFormViewModel {
    /** The text in force as written; `undefined` until it is read. */
    saved: InstanceIntro | undefined
    loadFailed: boolean
    retry: () => void
    /** The IdP refused this account as no admin (any more). */
    refused: boolean

    name: string
    description: string
    setName: (value: string) => void
    setDescription: (value: string) => void
    /** In characters, as the IdP counts them. */
    length: Record<IntroField, number>
    limits: Readonly<Record<IntroField, number>>
    isOver: (field: IntroField) => boolean
    /** "Name: 41 of 40 characters", for a screen reader; empty while every field is within its limit. */
    limitNotice: string
    preview: SignInPreview

    canCancel: boolean
    /** Stays true while saving, so Save keeps the focus. */
    canSave: boolean
    isSaving: boolean
    cancel: () => void
    save: () => Promise<void>
}

const FIELD_LABELS: Record<IntroField, string> = { name: "Name", description: "Description" }

const fieldsOf = (intro: InstanceIntro | undefined): Fields => ({
    name: intro?.name ?? "",
    description: intro?.description ?? "",
})

export function useIntroFormViewModel(host: string, info: InstanceInfo): IntroFormViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const queryClient = useQueryClient()
    // `null` while untouched: the fields then show the saved text, as read or as just saved.
    const [edits, setEdits] = useState<Fields | null>(null)

    const queryKey = adminQueryKey(idpUrl, "intro")
    const query = useQuery({
        queryKey,
        queryFn: () => getInstanceAdminPort().getIntro(idpUrl!, useAppStore.getState().accessToken!),
        enabled: idpUrl !== null && signedIn,
        retry: retryUnlessRefused,
    })
    const mutation = useMutation({
        // A read still in flight would answer the text from before the save.
        onMutate: () => queryClient.cancelQueries({ queryKey }),
        mutationFn: (text: InstanceIntro) =>
            getInstanceAdminPort().saveIntro(idpUrl!, useAppStore.getState().accessToken!, text),
        onSuccess: (saved) => queryClient.setQueryData(queryKey, saved),
        onError: (e) => {
            if (!refusedAsNonAdmin(e)) toast.error(e instanceof Error ? e.message : "Could not save the name and description")
        },
    })

    const saved = query.data
    const loaded = fieldsOf(saved)
    const fields = edits ?? loaded
    const draft = introDraft(fields.name, fields.description)
    const changed =
        saved !== undefined && (draft.text.name !== saved.name || draft.text.description !== saved.description)
    const edited = fields.name !== loaded.name || fields.description !== loaded.description
    const refused = refusedAsNonAdmin(query.error) || refusedAsNonAdmin(mutation.error)
    const canSave = changed && draft.over.length === 0

    async function save() {
        if (!canSave || mutation.isPending || !idpUrl || !useAppStore.getState().accessToken) return
        const sent = edits
        try {
            await mutation.mutateAsync(draft.text)
        } catch {
            return
        }
        // What was typed during the save stays.
        setEdits((current) => (current === sent ? null : current))
    }

    return {
        saved,
        loadFailed: query.isError && !refused,
        retry: () => void query.refetch(),
        refused,
        name: fields.name,
        description: fields.description,
        setName: (name) => setEdits((current) => ({ ...(current ?? loaded), name })),
        setDescription: (description) => setEdits((current) => ({ ...(current ?? loaded), description })),
        length: draft.length,
        limits: INTRO_LIMITS,
        isOver: (field) => draft.over.includes(field),
        limitNotice: draft.over
            .map((field) => `${FIELD_LABELS[field]}: ${draft.length[field]} of ${INTRO_LIMITS[field]} characters`)
            .join(". "),
        preview: {
            ...introPreview(draft.text, host),
            host,
            people: info.users === null ? null : peopleCount(info.users),
            open: info.openRegistrations,
        },
        canCancel: edited && !mutation.isPending,
        canSave,
        isSaving: mutation.isPending,
        cancel: () => setEdits(null),
        save,
    }
}
