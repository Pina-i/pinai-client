import type { IE2eePort } from "@pinai/domain/ports/e2ee.port"
import { ConversationJoins, type JoinContext } from "@pinai/domain/usecases/e2ee/join-conversations.usecase"
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

/** The access token read at each step: a join or a send may outlast a renewal. */
export function joinContext(idpUrl: string): JoinContext {
    return { idpUrl, accessToken: () => useAppStore.getState().accessToken }
}
