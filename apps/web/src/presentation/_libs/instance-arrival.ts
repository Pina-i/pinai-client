import type { InstanceArrival } from "@pinai/domain/models/instance"
import { arriveAtInstanceUseCase } from "@pinai/domain/usecases/auth/arrive-at-instance.usecase"
import { getAuthPlatform } from "@/ioc/index"
import { useAppStore } from "@/store/store"

/** `/?instance=<domain>`: where the IdP sends someone after an invitation's sign-up or a reset link. */
export const ARRIVAL_PARAM = "instance"

/** The landing's `beforeLoad`: what `?instance=` asks, after dropping the session of another instance. */
export function arriveAtInstance(searchStr: string): InstanceArrival {
    const asked = new URLSearchParams(searchStr).get(ARRIVAL_PARAM)
    if (asked === null) return { kind: "none" }
    return arriveAtInstanceUseCase(
        asked,
        useAppStore.getState().idpUrl,
        () => useAppStore.getState().leaveIdp(),
        getAuthPlatform(),
    )
}
