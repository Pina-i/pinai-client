import { instanceAddress } from "@pinai/domain/models/instance"
import { passwordChange, type PasswordChange } from "@pinai/domain/models/instance-admin"
import type { InstanceInfo } from "@pinai/domain/models/instance"
import { resolveInstanceUseCase } from "@pinai/domain/usecases/instance/resolve-instance.usecase"
import { useEffect, useState } from "react"
import { getNodeInfoPort } from "@/ioc"
import { useAppStore } from "@/store/store"

/** How the user changes their password on this instance (`passwordChange`, over its NodeInfo); `unknown` until read, or unless `enabled`. */
export function usePasswordChange(enabled: boolean): PasswordChange {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const admin = useAppStore((s) => s.user?.admin === true)
    const [info, setInfo] = useState<InstanceInfo | null>(null)
    useEffect(() => {
        const address = idpUrl ? instanceAddress(idpUrl) : null
        if (!enabled || !address) return
        let live = true
        resolveInstanceUseCase(address, getNodeInfoPort())
            .then((found) => {
                if (live) setInfo(found)
            })
            .catch(() => undefined)
        return () => {
            live = false
        }
    }, [enabled, idpUrl])
    return passwordChange(info, admin)
}
