import { useQuery } from "@tanstack/react-query"

import { instanceAddress } from "@pinai/domain/models/instance"
import { passwordChange, type PasswordChange } from "@pinai/domain/models/instance-admin"
import { resolveInstanceUseCase } from "@pinai/domain/usecases/instance/resolve-instance.usecase"
import { getNodeInfoPort } from "@/ioc"
import { useAppStore } from "@/store/store"

/** How the user changes their password on this instance (`passwordChange`, over its NodeInfo); `unknown` until read, or unless `enabled`. */
export function usePasswordChange(enabled: boolean): PasswordChange {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const admin = useAppStore((s) => s.user?.admin === true)
    const instance = useQuery({
        queryKey: ["instance-info", idpUrl],
        queryFn: () => {
            const address = idpUrl ? instanceAddress(idpUrl) : null
            return address ? resolveInstanceUseCase(address, getNodeInfoPort()) : null
        },
        enabled: !!idpUrl && enabled,
        staleTime: 60_000,
    })
    return passwordChange(instance.data ?? null, admin)
}
