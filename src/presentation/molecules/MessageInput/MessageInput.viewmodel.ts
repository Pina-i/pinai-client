import { useCallback, useImperativeHandle, useRef, useState, type RefObject } from "react"
import { toast } from "sonner"
import type { Attachment } from "@/domain/models/dm"
import { uploadAttachmentUseCase } from "@/domain/usecases/dm/upload-attachment.usecase"
import { getDmPort } from "@/ioc"
import { useAppStore } from "@/store/store"

/** Maximum files attached to a single message (mirrors the backend default). */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5

/** A file that the user has staged for sending. */
export interface PendingAttachment {
    /** Local-only id used as a React key and cancellation handle. */
    localId: string
    /** The original picked/dropped File object. Kept around for retries. */
    file: File
    /** Upload progress, 0..1. Reaches 1 only on successful upload. */
    progress: number
    /** Populated once the IdP returns the orphan attachment row. */
    attachment?: Attachment
    /** Set when the upload fails — surfaces in the row UI as a retry affordance. */
    error?: string
    /** Used to cancel an in-flight upload (× button on the row). */
    controller: AbortController
}

/** Imperative handle so the conversation page can pump dropped files in. */
export interface MessageInputHandle {
    addFiles: (files: File[]) => void
}

interface UseMessageInputViewModelArgs {
    onSend: (content: string, attachmentIds: string[]) => void | Promise<void>
    onType?: () => void
    handleRef?: RefObject<MessageInputHandle | null>
}

export interface MessageInputViewModel {
    value: string
    setValue: (next: string) => void
    pending: PendingAttachment[]
    /** True while any pending attachment is mid-upload. Send is blocked. */
    isUploading: boolean
    /** True when send has been invoked and the parent's onSend is awaiting. */
    isSending: boolean
    canSend: boolean
    pickedFileInputRef: RefObject<HTMLInputElement | null>
    onPickClick: () => void
    onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    onAddFiles: (files: File[]) => void
    onRemovePending: (localId: string) => void
    onSubmit: () => Promise<void>
    onEmojiSelect: (emoji: string) => void
}

export function useMessageInputViewModel(args: UseMessageInputViewModelArgs): MessageInputViewModel {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)

    const [value, setValueRaw] = useState("")
    const [pending, setPending] = useState<PendingAttachment[]>([])
    const [isSending, setIsSending] = useState(false)

    const pickedFileInputRef = useRef<HTMLInputElement | null>(null)

    const isUploading = pending.some((p) => !p.attachment && !p.error)

    /** Either a non-empty trimmed message OR ≥1 successfully uploaded attachment. */
    const hasContent = value.trim().length > 0
    const hasReadyAttachment = pending.some((p) => p.attachment != null)
    const canSend = !isSending && !isUploading && (hasContent || hasReadyAttachment)

    function setValue(next: string) {
        setValueRaw(next)
        if (next.trim().length > 0) args.onType?.()
    }

    function patchPending(localId: string, patch: Partial<PendingAttachment>) {
        setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p)))
    }

    const onAddFiles = useCallback(
        (files: File[]) => {
            if (files.length === 0) return
            if (!accessToken || !idpUrl) {
                toast.error("Not signed in.")
                return
            }

            // Cap is checked against the *current* pending count — the user can
            // pick a few, then add more, as long as the total stays ≤ 5.
            const slotsLeft = MAX_ATTACHMENTS_PER_MESSAGE - pending.length
            if (slotsLeft <= 0) {
                toast.error(`Up to ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`)
                return
            }
            const accepted = files.slice(0, slotsLeft)
            if (files.length > slotsLeft) {
                toast.error(`Only the first ${slotsLeft} file(s) were added.`)
            }

            const newRows: PendingAttachment[] = accepted.map((file) => ({
                localId: crypto.randomUUID(),
                file,
                progress: 0,
                controller: new AbortController(),
            }))

            setPending((prev) => [...prev, ...newRows])

            // Kick off each upload independently so per-file progress is honest.
            for (const row of newRows) {
                const localId = row.localId
                uploadAttachmentUseCase(getDmPort(), {
                    idpUrl,
                    accessToken,
                    file: row.file,
                    signal: row.controller.signal,
                    onProgress: (loaded, total) => {
                        patchPending(localId, { progress: total > 0 ? loaded / total : 0 })
                    },
                })
                    .then((attachment) => {
                        patchPending(localId, { attachment, progress: 1 })
                    })
                    .catch((err: unknown) => {
                        // Aborted uploads (user clicked × on the row) are silent.
                        if (err instanceof DOMException && err.name === "AbortError") return
                        const message = err instanceof Error ? err.message : "Upload failed"
                        patchPending(localId, { error: message })
                        toast.error(`${row.file.name}: ${message}`)
                    })
            }
        },
        [accessToken, idpUrl, pending.length],
    )

    function onPickClick() {
        pickedFileInputRef.current?.click()
    }

    function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? [])
        // Reset so the same file can be re-picked later.
        e.target.value = ""
        onAddFiles(files)
    }

    function onRemovePending(localId: string) {
        setPending((prev) => {
            const row = prev.find((p) => p.localId === localId)
            // Cancel an in-flight upload — orphan rows on the server will be
            // reaped by the orphan-sweep task; nothing to clean up explicitly.
            if (row && !row.attachment && !row.error) {
                row.controller.abort()
            }
            return prev.filter((p) => p.localId !== localId)
        })
    }

    async function onSubmit() {
        if (!canSend) return
        const content = value.trim()
        const attachmentIds = pending
            .map((p) => p.attachment?.id)
            .filter((id): id is string => typeof id === "string")

        setIsSending(true)
        try {
            await args.onSend(content, attachmentIds)
            // Clear after a successful onSend — failures should keep the draft.
            setValueRaw("")
            setPending([])
        } finally {
            setIsSending(false)
        }
    }

    function onEmojiSelect(emoji: string) {
        setValueRaw((prev) => prev + emoji)
        args.onType?.()
    }

    useImperativeHandle(args.handleRef, () => ({ addFiles: onAddFiles }), [onAddFiles])

    return {
        value,
        setValue,
        pending,
        isUploading,
        isSending,
        canSend,
        pickedFileInputRef,
        onPickClick,
        onFileInputChange,
        onAddFiles,
        onRemovePending,
        onSubmit,
        onEmojiSelect,
    }
}
