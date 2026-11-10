import { useEffect } from "react"

import { getAppBadgePort } from "@/ioc/index"
import { useNotificationSettings } from "@/presentation/providers/AppearanceProvider/NotificationSettings.context"
import { useBell } from "@/presentation/providers/BellProvider/Bell.context"
import { useWindowAttended } from "@/presentation/hooks/use-window-attention"
import { useAppStore } from "@/store/store"
import { APP_TITLE, attentionCount, titleWithCount, unseenNotifications } from "@pinai/domain/models/attention"

export function useAttention(): void {
    const { notifications } = useNotificationSettings()
    const { seenIds } = useBell()
    const windowAttended = useWindowAttended()
    const count = useAppStore((s) =>
        s.user === null
            ? 0
            : attentionCount({
                  conversations: s.localDmConvos,
                  unread: s.dmUnread,
                  openId: s.activeDm,
                  windowAttended,
                  notifications,
                  bellUnread: unseenNotifications(s.notifications, seenIds).length,
              }),
    )

    useEffect(() => {
        document.title = titleWithCount(APP_TITLE, count)
        showOnIcon(count)
    }, [count])

    useEffect(
        () => () => {
            document.title = APP_TITLE
            showOnIcon(0)
        },
        [],
    )
}

function showOnIcon(count: number): void {
    // A badge the main process refused leaves the last one up; the page's next count replaces it.
    getAppBadgePort().setCount(count).catch(() => {})
}
