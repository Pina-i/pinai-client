import { AttachmentCache } from "@pinai/domain/lib/attachment-cache"
import { openAttachmentUseCase } from "@pinai/domain/usecases/dm/open-attachment.usecase"
import { getAttachmentCryptoPort, getDmPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { dataUri } from "./data-uri"

// Kept in memory only, as `data:` URIs: never a decrypted file on the phone's storage.
const BUDGET_BYTES = 32 * 1024 * 1024

export const attachmentImages = new AttachmentCache(
    (key) => {
        const { idpUrl, accessToken } = useAppStore.getState()
        if (!idpUrl || !accessToken) return Promise.reject(new Error("Not signed in"))
        return openAttachmentUseCase({ idpUrl, accessToken }, key, { dm: getDmPort(), attachmentCrypto: getAttachmentCryptoPort() })
    },
    BUDGET_BYTES,
    { create: dataUri, revoke: () => undefined }
)

// Another account's plaintext is never shown, nor kept past its sign-out.
let account = useAppStore.getState().user?.actor_uri ?? null
useAppStore.subscribe((state) => {
    const now = state.user?.actor_uri ?? null
    if (now === account) return
    account = now
    attachmentImages.clear()
})
