import type { DirectMessage } from "../../models/dm"
import type { IDmPort } from "../../ports/dm.port"
import type { IGroupPort } from "../../ports/group.port"

export type ConversationRoute =
    | { kind: "group"; conversationId: string }
    | { kind: "dm"; recipientAddress: string }

/**
 * A reaction is one more MLS application message, so it takes the same
 * transport as text: `POST /api/dm` would file a group's reaction in the
 * 1:1 with `recipientAddress`, where its group ciphertext cannot decrypt.
 * Answers the row the IdP stored: the history archive files the reaction under its id.
 */
export async function sendReactionUseCase(
    idpUrl: string,
    accessToken: string,
    route: ConversationRoute,
    mlsCiphertext: string,
    dmPort: IDmPort,
    groupPort: IGroupPort,
): Promise<DirectMessage> {
    if (route.kind === "group") {
        return groupPort.sendGroupMessage(idpUrl, accessToken, route.conversationId, mlsCiphertext)
    }
    return dmPort.sendMessage(idpUrl, accessToken, route.recipientAddress, mlsCiphertext)
}
