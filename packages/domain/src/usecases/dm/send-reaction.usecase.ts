import type { IDmPort } from "../../ports/dm.port"
import type { IGroupPort } from "../../ports/group.port"

export type ConversationRoute =
    | { kind: "group"; conversationId: string }
    | { kind: "dm"; recipientAddress: string }

/**
 * A reaction is one more MLS application message, so it takes the same
 * transport as text: `POST /api/dm` would file a group's reaction in the
 * 1:1 with `recipientAddress`, where its group ciphertext cannot decrypt.
 */
export async function sendReactionUseCase(
    idpUrl: string,
    accessToken: string,
    route: ConversationRoute,
    mlsCiphertext: string,
    dmPort: IDmPort,
    groupPort: IGroupPort,
): Promise<void> {
    if (route.kind === "group") {
        await groupPort.sendGroupMessage(idpUrl, accessToken, route.conversationId, mlsCiphertext)
        return
    }
    await dmPort.sendMessage(idpUrl, accessToken, route.recipientAddress, mlsCiphertext)
}
