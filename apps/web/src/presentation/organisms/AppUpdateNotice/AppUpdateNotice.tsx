import { useAppUpdateNoticeViewModel } from "./AppUpdateNotice.viewmodel"

/** The installed app's update, as a toast that stays; nothing in the browser. */
export function AppUpdateNotice() {
    useAppUpdateNoticeViewModel()
    return null
}
