import { AttachmentCache, type AttachmentUrls } from "@pinai/domain/lib/attachment-cache"
import { openAttachmentUseCase } from "@pinai/domain/usecases/dm/open-attachment.usecase"
import { getAttachmentCryptoPort, getDmPort } from "@/ioc"
import { useAppStore } from "@/store/store"

const BUDGET_BYTES = 150 * 1024 * 1024

const objectUrls: AttachmentUrls = {
    create: (bytes, type) => URL.createObjectURL(new Blob([bytes as BlobPart], { type })),
    revoke: (url) => URL.revokeObjectURL(url),
}

/** The page load's attachments, as object URLs (the domain's `AttachmentCache`). */
export const attachmentCache = new AttachmentCache(
    (key) => {
        const { idpUrl, accessToken } = useAppStore.getState()
        if (!idpUrl || !accessToken) return Promise.reject(new Error("Not signed in"))
        return openAttachmentUseCase({ idpUrl, accessToken }, key, {
            dm: getDmPort(),
            attachmentCrypto: getAttachmentCryptoPort(),
        })
    },
    BUDGET_BYTES,
    objectUrls,
)

// Another account's plaintext is never shown, nor kept in memory past its sign-out.
let account = useAppStore.getState().user?.actor_uri ?? null
useAppStore.subscribe((state) => {
    const now = state.user?.actor_uri ?? null
    if (now === account) return
    account = now
    attachmentCache.clear()
})
