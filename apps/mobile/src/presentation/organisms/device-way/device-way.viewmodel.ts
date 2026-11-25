import { approvingDevices, codeHalves, nextCodeWording, SHARE_WAIT_AFTER_IN_MS } from "@pinai/domain/models/approval-handshake"
import type { DeviceListEntry } from "@pinai/domain/models/device"
import { useEffect, useRef, useState } from "react"
import { getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useApprovalAsking } from "@/presentation/hooks/use-approval-asking"
import { useAppStore } from "@/store/store"
import { arrivalLine, askingLine } from "./device-way-wording"
import type { DeviceWayProps } from "./device-way"

const timeOfDay = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

/**
 * The code another device types, renewed when nobody answered it in time; approved, on to the app once the key share is
 * kept — or, let in without one, after `SHARE_WAIT_AFTER_IN_MS`, the app taking it when it comes.
 */
export function useDeviceWayViewModel({ active, deviceReady, share, onApproved, onIn }: DeviceWayProps) {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const { state, entering, newCode } = useApprovalAsking(deviceReady, active)
    const [now, setNow] = useState(() => Date.now())
    const [thisDeviceId, setThisDeviceId] = useState<string | null>(null)
    const [devices, setDevices] = useState<DeviceListEntry[]>([])
    const onApprovedRef = useRef(onApproved)
    const onInRef = useRef(onIn)
    useEffect(() => {
        onApprovedRef.current = onApproved
        onInRef.current = onIn
    })

    const approved = state.kind === "approved"
    useEffect(() => {
        if (approved) onApprovedRef.current()
    }, [approved])

    // Nothing to restore on the phone yet: the words kept, it goes on at once.
    const arrived = approved && share?.kind === "kept"
    useEffect(() => {
        if (arrived) onInRef.current()
    }, [arrived])

    const inWithoutWords = entering?.kind === "in" && (share === null || share.kind === "waiting")
    useEffect(() => {
        if (!inWithoutWords) return
        const timer = setTimeout(() => onInRef.current(), SHARE_WAIT_AFTER_IN_MS)
        return () => clearTimeout(timer)
    }, [inWithoutWords])

    const counting = state.kind === "showing" && !state.answered
    useEffect(() => {
        if (!counting) return
        const timer = setInterval(() => setNow(Date.now()), 1_000)
        return () => clearInterval(timer)
    }, [counting])

    useEffect(() => {
        if (!deviceReady || !idpUrl) return
        let live = true
        void getE2eePort()
            .getDeviceId()
            .then((id) => {
                if (live) setThisDeviceId(id)
            })
            .catch((error: unknown) => warnE2ee("reading this device's id", error))
        const accessToken = useAppStore.getState().accessToken
        if (accessToken) {
            void getDeviceDirectoryPort()
                .listDevices(idpUrl, accessToken)
                .then((list) => {
                    if (live) setDevices(list.devices)
                })
                .catch((error: unknown) => warnE2ee("listing the devices that can approve", error))
        }
        return () => {
            live = false
        }
    }, [deviceReady, idpUrl])

    const shown = state.kind === "showing" ? state : null
    const isIn = entering?.kind === "in"
    const action = state.kind === "stopped" ? "New code" : approved && isIn && share?.kind === "unusable" ? "Go on without it" : null

    return {
        halves: shown ? codeHalves(shown.code) : null,
        nextCode: shown && !shown.answered ? nextCodeWording(shown.deadline, now) : null,
        line: approved ? arrivalLine(entering, share) : askingLine(state, timeOfDay),
        action,
        onAction: () => {
            if (approved) onInRef.current()
            else newCode()
        },
        // Not before this device is known: it would list itself.
        approvers: thisDeviceId ? approvingDevices(devices, thisDeviceId) : [],
    }
}
