import { useCallback, useRef } from "react"
import { useAppStore } from "@/store/store"

export function useHomePageViewModel() {
    const {
        view,
        activeServer,
        activeChannel,
        activeDm,
        channelsByServer,
        localDmConvos,
        localMessages,
        localDmMessages,
        searchQuery,
        sendMessage,
    } = useAppStore()

    const currentChannel = (channelsByServer[activeServer] ?? []).find((c) => c.id === activeChannel)
    const activeDmData = localDmConvos.find((d) => d.id === activeDm)
    const currentMessages =
        view === "dms" && activeDm ? (localDmMessages[activeDm] ?? []) : (localMessages[activeChannel] ?? [])

    const filteredMessages = searchQuery
        ? currentMessages.filter(
              (m) =>
                  m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  m.author.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : currentMessages

    const messagePlaceholder =
        view === "dms"
            ? `Message @${activeDmData?.name ?? ""}`
            : `Message #${currentChannel?.name ?? ""}`

    const messagesEndRef = useRef<HTMLDivElement>(null)

    const handleSendMessage = useCallback(
        (content: string) => {
            sendMessage(content)
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
        },
        [sendMessage],
    )

    return {
        view,
        activeDm,
        filteredMessages,
        messagePlaceholder,
        messagesEndRef,
        sendMessage: handleSendMessage,
    }
}
