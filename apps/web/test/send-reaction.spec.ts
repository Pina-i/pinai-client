/**
 * A reaction is an MLS application message of its conversation, so a group's
 * reaction must reach the group endpoint. Sent through `POST /api/dm` it lands
 * in the reactor's 1:1 with one member, who sees it as `[encrypted]`.
 */
import { describe, expect, it, vi } from "vitest"

import type { IDmPort } from "@pinai/domain/ports/dm.port"
import type { IGroupPort } from "@pinai/domain/ports/group.port"
import { sendReactionUseCase } from "@pinai/domain/usecases/dm/send-reaction.usecase"

const IDP = "http://localhost:8080"
const GROUP_ID = "dc96b08e-94d3-45d0-8962-9acdc9e44a1f"

function ports() {
    const dmPort = { sendMessage: vi.fn().mockResolvedValue({}) } as unknown as IDmPort
    const groupPort = { sendGroupMessage: vi.fn().mockResolvedValue({}) } as unknown as IGroupPort
    return { dmPort, groupPort }
}

describe("sendReactionUseCase", () => {
    it("sends a group reaction to the group, never to a member's 1:1", async () => {
        const { dmPort, groupPort } = ports()

        await sendReactionUseCase(IDP, "tok", { kind: "group", conversationId: GROUP_ID }, "cipher", dmPort, groupPort)

        expect(groupPort.sendGroupMessage).toHaveBeenCalledWith(IDP, "tok", GROUP_ID, "cipher")
        expect(dmPort.sendMessage).not.toHaveBeenCalled()
    })

    it("sends a 1:1 reaction to the peer", async () => {
        const { dmPort, groupPort } = ports()

        await sendReactionUseCase(
            IDP,
            "tok",
            { kind: "dm", recipientAddress: "Bob_gERkU@localhost:8081" },
            "cipher",
            dmPort,
            groupPort,
        )

        expect(dmPort.sendMessage).toHaveBeenCalledWith(IDP, "tok", "Bob_gERkU@localhost:8081", "cipher")
        expect(groupPort.sendGroupMessage).not.toHaveBeenCalled()
    })

    it("propagates a failed send so the optimistic toggle can roll back", async () => {
        const { dmPort, groupPort } = ports()
        vi.mocked(groupPort.sendGroupMessage).mockRejectedValue(new Error("403"))

        await expect(
            sendReactionUseCase(IDP, "tok", { kind: "group", conversationId: GROUP_ID }, "cipher", dmPort, groupPort),
        ).rejects.toThrow("403")
    })
})
