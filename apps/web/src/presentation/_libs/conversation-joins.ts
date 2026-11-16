import type { ActorUri, ConversationId } from "@pinai/domain/models/e2ee"
import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import {
    ConversationJoins,
    enterConversationUseCase,
    type JoinContext,
} from "@pinai/domain/usecases/e2ee/join-conversations.usecase"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useAppStore } from "@/store/store"

// One for the page load: a send waits on the join the app started.
let joins: { over: IE2eePort; running: ConversationJoins } | null = null

export function conversationJoins(): ConversationJoins {
    const port = getE2eePort()
    if (joins?.over !== port) {
        joins?.running.stop()
        const running = new ConversationJoins({
            e2ee: port,
            deviceDirectory: getDeviceDirectoryPort(),
            after: (ms, run) => {
                const timer = setTimeout(run, ms)
                return () => clearTimeout(timer)
            },
            report: (conversationId, error) => warnE2ee(`joining ${conversationId}, tried again later`, error),
        })
        joins = { over: port, running }
    }
    return joins.running
}

function joinContext(idpUrl: string): JoinContext {
    return { idpUrl, accessToken: () => useAppStore.getState().accessToken }
}

/** Every conversation of the list this device holds no group for, joined or left to a Welcome; never thrown. */
export function joinMissingConversations(): void {
    const { idpUrl, localDmConvos } = useAppStore.getState()
    if (!idpUrl) return
    conversationJoins()
        .sync(joinContext(idpUrl), localDmConvos)
        .catch((e: unknown) => warnE2ee("looking for conversations to join", e))
}

/** Before a send: the device in the conversation, waiting meanwhile, or the DM founded (`peer`, its other member). */
export async function enterConversation(conversation: { id: ConversationId; peer: ActorUri | null }): Promise<void> {
    const { idpUrl } = useAppStore.getState()
    if (!idpUrl) throw new Error("Signed out")
    await enterConversationUseCase(conversationJoins(), getE2eePort(), joinContext(idpUrl), conversation)
}
