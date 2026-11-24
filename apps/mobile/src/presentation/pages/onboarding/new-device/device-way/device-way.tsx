import type { AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { Text } from "react-native"

export interface DeviceWayProps {
    /** The way on screen: off it, a request nobody answered ends. */
    active: boolean
    deviceReady: boolean
    share: AwaitedShareState | null
    onApproved: () => void
    onIn: () => void
    onUseWords: () => void
}

export function DeviceWay(_: DeviceWayProps) {
    return <Text>Approve from another device</Text>
}
