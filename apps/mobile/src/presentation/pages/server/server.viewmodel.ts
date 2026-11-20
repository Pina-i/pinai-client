import { instanceAddress, type InstanceAddress, type InstanceInfo, instanceResolution } from "@pinai/domain/models/instance"
import { loadRecentInstancesUseCase } from "@pinai/domain/usecases/instance/recent-instances.usecase"
import { resolveInstanceUseCase } from "@pinai/domain/usecases/instance/resolve-instance.usecase"
import { router } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { getNodeInfoPort, getRecentInstancesPort } from "@/ioc"
import { goToRow, instanceRows, type RecentInstance } from "./server-choices"

// Long enough that typing a host doesn't ask every prefix of it, as on the web.
const RESOLVE_DEBOUNCE_MS = 350

export function useServerViewModel() {
    const [input, setInput] = useState("")
    const [resolved, setResolved] = useState<{ origin: string; info: InstanceInfo | null } | null>(null)
    const [recents, setRecents] = useState<RecentInstance[]>(() =>
        loadRecentInstancesUseCase(getRecentInstancesPort()).map((address) => ({ address, info: undefined })),
    )

    // Each recent instance read once as the sheet opens, for its name and whether it is open.
    useEffect(() => {
        let current = true
        for (const { address } of recents) {
            void resolveInstanceUseCase(address, getNodeInfoPort())
                .catch(() => null)
                .then((info) => {
                    if (current) setRecents((list) => list.map((recent) => (recent.address.origin === address.origin ? { ...recent, info } : recent)))
                })
        }
        return () => {
            current = false
        }
        // Once: the list is the one read as the sheet opened.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const address = useMemo(() => instanceAddress(input), [input])
    useEffect(() => {
        if (!address) return
        let current = true
        const timer = setTimeout(() => {
            void resolveInstanceUseCase(address, getNodeInfoPort())
                .catch(() => null)
                .then((info) => {
                    if (current) setResolved({ origin: address.origin, info })
                })
        }, RESOLVE_DEBOUNCE_MS)
        return () => {
            current = false
            clearTimeout(timer)
        }
    }, [address])

    const goTo = goToRow(input, instanceResolution(input, resolved), recents)
    const list = instanceRows(input, recents)

    function open(target: InstanceAddress, info: InstanceInfo) {
        router.replace({ pathname: "/opening", params: { origin: target.origin, name: info.name } })
    }

    function pick(target: InstanceAddress, info: InstanceInfo | null | undefined) {
        if (info) open(target, info)
        else setInput(target.host)
    }

    return {
        input,
        setInput,
        goTo,
        openTyped: () => goTo?.ready && open(goTo.ready.address, goTo.ready.info),
        list,
        pick,
        cancel: () => router.back(),
    }
}
