import type { RestoredMessage } from "@pinai/domain/models/history-archive"
import { applyRestoredHistoryUseCase } from "@pinai/domain/usecases/e2ee/apply-restored-history.usecase"
import { conversationCache } from "@/presentation/_libs/conversation-cache"
import { useAppStore } from "@/store/store"

/** The archive's messages into the store, as the domain applies them to a conversation cache. */
export async function replayRestoredHistory(messages: readonly RestoredMessage[]): Promise<void> {
    await applyRestoredHistoryUseCase(messages, { cache: conversationCache, myAddress: useAppStore.getState().user?.address })
}
