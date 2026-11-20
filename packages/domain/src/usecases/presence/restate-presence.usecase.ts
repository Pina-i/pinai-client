import type { UserStatus } from "../../models/presence"
import type { IWsPort } from "../../ports/ws.port"
import { setPresenceUseCase } from "./set-presence.usecase"

/**
 * Once a connection is (back) up: the IdP reads a new connection as online, so a status the user
 * chose — idle, do not disturb, invisible — is told again, or a reconnect would undo it.
 */
export function restatePresenceUseCase(wsPort: IWsPort, status: UserStatus): void {
    if (status !== "online") setPresenceUseCase(wsPort, status)
}
