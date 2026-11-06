import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import { passwordChange, type PasswordChange } from "@pinai/domain/models/instance-admin"
import { instanceAddress } from "@pinai/domain/models/instance"
import { promptShown, type StartOverRequest } from "@pinai/domain/models/start-over"
import { resolveInstanceUseCase } from "@pinai/domain/usecases/instance/resolve-instance.usecase"
import {
    endStartOverUseCase,
    startOverToPromptUseCase,
    type StartOverPrompt,
} from "@pinai/domain/usecases/e2ee/start-over-request.usecase"
import { getE2eePort, getNodeInfoPort, getStartOverPort } from "@/ioc"
import { instanceHost } from "@/presentation/_libs/instance-host"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { startOverRefusalLine } from "@/presentation/_libs/start-over-wording"
import { useAskedLine } from "@/presentation/hooks/use-asked-line"
import { startOverQueryKey } from "@/presentation/hooks/use-own-start-over"
import { registerStartOverHandler } from "@/presentation/hooks/useIdpWebSocket"
import { useAppStore } from "@/store/store"

const promptQueryKey = (idpUrl: string) => [...startOverQueryKey(idpUrl), "prompt"] as const

type Stage = "asked" | "guide" | "cancelled"

// "Not now" lasts this page load: the next load reads the request again, and a push brings it back.
const putOff = new Set<string>()

export interface StartOverDoorViewModel {
    request: StartOverRequest | null
    /** `asked`: the request and its answers; `guide`: "It's me"'s way; `cancelled`: what to do about the password. */
    stage: Stage
    /** Only a device that can answer a code offers "It's me — approve with a code instead". */
    answersCodes: boolean
    /** The device asking, by name. */
    device: string
    /** "asked 2 hours ago · kauai.studio" */
    asked: string
    host: string
    /** How to change the password once cancelled, by the instance's mode as NodeInfo says it. */
    passwordChange: PasswordChange
    cancelling: boolean
    error: string | null
    onCancel: () => void
    onItsMe: () => void
    onNotNow: () => void
    onDone: () => void
}

/**
 * Shown whenever the IdP answers another device's open request: it shows one only to the devices
 * that may cancel it, and a missed warning is the costly failure. Read at each load, on
 * `start_over_requested` and when the socket comes back — pushes reach live sessions only.
 */
export function useStartOverDoorViewModel(): StartOverDoorViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const admin = useAppStore((s) => s.user?.admin === true)
    const socketUp = useAppStore((s) => s.wsStatus === "connected")
    const queryClient = useQueryClient()
    const [, setPutOffCount] = useState(putOff.size)
    // What the modal shows, kept past the request's end while it says what to do next.
    const [held, setHeld] = useState<{ prompt: StartOverPrompt; stage: Exclude<Stage, "asked"> } | null>(null)
    const [cancelling, setCancelling] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const connects = useRef(0)

    const query = useQuery({
        queryKey: promptQueryKey(idpUrl ?? ""),
        queryFn: () =>
            startOverToPromptUseCase({ e2eePort: getE2eePort(), startOverPort: getStartOverPort() })(
                idpUrl!,
                useAppStore.getState().accessToken!,
            ),
        enabled: !!idpUrl && signedIn,
    })

    useEffect(
        () =>
            registerStartOverHandler((event) => {
                const id = event.data.request_id
                if (event.type === "start_over_requested") {
                    putOff.delete(id)
                    setPutOffCount(putOff.size)
                    return
                }
                if (idpUrl) queryClient.setQueryData<StartOverPrompt | null>(promptQueryKey(idpUrl), (p) => (p?.request.id === id ? null : p))
                setHeld((h) => (h && h.stage !== "cancelled" && h.prompt.request.id === id ? null : h))
            }),
        [idpUrl, queryClient],
    )

    // The first connect follows the read at load; a later one may have missed a push.
    useEffect(() => {
        if (!socketUp || !idpUrl) return
        if (connects.current++ === 0) return
        void queryClient.invalidateQueries({ queryKey: startOverQueryKey(idpUrl) })
    }, [socketUp, idpUrl, queryClient])

    const shown = query.data && promptShown(query.data.request, putOff) ? query.data : null
    const prompt = held?.prompt ?? shown
    const request = prompt?.request ?? null
    const stage: Stage = held?.stage ?? "asked"
    const asked = useAskedLine(request?.createdAt ?? null)

    const instance = useQuery({
        queryKey: ["instance-info", idpUrl],
        queryFn: () => {
            const address = idpUrl ? instanceAddress(idpUrl) : null
            return address ? resolveInstanceUseCase(address, getNodeInfoPort()) : null
        },
        enabled: !!idpUrl && stage === "cancelled",
        staleTime: 60_000,
    })

    const putOffNow = useCallback((id: string) => {
        putOff.add(id)
        setPutOffCount(putOff.size)
    }, [])

    const onCancel = useCallback(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!prompt || !idpUrl || !accessToken || cancelling) return
        setCancelling(true)
        setError(null)
        void endStartOverUseCase({ startOverPort: getStartOverPort() })(idpUrl, accessToken, prompt.request.id)
            .then((ended) => {
                // Gone already — withdrawn, approved, cancelled elsewhere —: nothing left to say here.
                if (ended === "ended") setHeld({ prompt, stage: "cancelled" })
                else putOffNow(prompt.request.id)
                void queryClient.invalidateQueries({ queryKey: startOverQueryKey(idpUrl) })
            })
            .catch((e: unknown) => {
                warnE2ee("cancelling the start over request", e)
                setError(startOverRefusalLine(e, "cancel"))
            })
            .finally(() => setCancelling(false))
    }, [prompt, idpUrl, cancelling, queryClient, putOffNow])

    const onItsMe = useCallback(() => {
        if (prompt) setHeld({ prompt, stage: "guide" })
    }, [prompt])

    const onNotNow = useCallback(() => {
        if (request) putOffNow(request.id)
        setError(null)
    }, [request, putOffNow])

    const onDone = useCallback(() => {
        if (held) putOffNow(held.prompt.request.id)
        setHeld(null)
    }, [held, putOffNow])

    return {
        request,
        stage,
        answersCodes: prompt?.answersCodes ?? false,
        device: request?.displayName.trim() || "A device",
        asked,
        host: instanceHost(idpUrl),
        passwordChange: passwordChange(instance.data ?? null, admin),
        cancelling,
        error,
        onCancel,
        onItsMe,
        onNotNow,
        onDone,
    }
}
