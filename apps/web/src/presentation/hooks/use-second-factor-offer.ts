import { useQuery } from "@tanstack/react-query"

import { mayTurnOnSecondFactorUseCase } from "@pinai/domain/usecases/e2ee/second-factor-approval.usecase"
import { getE2eePort } from "@/ioc"
import { useAppStore } from "@/store/store"

/** Whether this device may turn the second factor on (`mayTurnOnSecondFactor`); `null` until read. */
export function useMayTurnOnSecondFactor(): boolean | null {
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const query = useQuery({
        queryKey: ["second-factor-offer", actorUri],
        queryFn: () => mayTurnOnSecondFactorUseCase(getE2eePort())(),
        enabled: actorUri !== null,
        retry: false,
    })
    // Unreadable here, the IdP decides: its `approval_required` is told all the same.
    if (query.isError) return true
    return query.data ?? null
}
