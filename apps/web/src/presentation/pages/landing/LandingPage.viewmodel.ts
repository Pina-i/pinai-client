import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouteContext, useRouter } from "@tanstack/react-router"
import {
    describeInstance,
    displayAddress,
    instanceAddress,
    type InstanceAddress,
    type InstanceInfo,
} from "@pinai/domain/models/instance"
import { prepareLoginUseCase } from "@pinai/domain/usecases/auth/startLogin.usecase"
import { resolveInstanceUseCase } from "@pinai/domain/usecases/instance/resolve-instance.usecase"
import { loadRecentInstancesUseCase } from "@pinai/domain/usecases/instance/recent-instances.usecase"
import {
    getAuthPlatform,
    getAuthPort,
    getAuthSessionStore,
    getNodeInfoPort,
    getRecentInstancesPort,
} from "@/ioc/index"
import { ARRIVAL_PARAM } from "@/presentation/_libs/instance-arrival"
import { dropSearchParam } from "@/presentation/_libs/search-param"
import type { ResolutionTone } from "./home-picker/home-picker"

const DEFAULT_IDP_URL = import.meta.env.VITE_DEFAULT_IDP_URL ?? "http://localhost:8088"

// Long enough that typing a host doesn't ask every prefix of it.
const RESOLVE_DEBOUNCE_MS = 350

interface Handoff {
    name: string
    /** The `/authorize` URL, once discovery and PKCE are done. */
    url: string | null
    /** The bar has reached the instance (at once with reduced motion). */
    barDone: boolean
}

function initialAddress(): string {
    const stored = instanceAddress(getAuthSessionStore().get("idp_url") ?? DEFAULT_IDP_URL)
    return stored ? displayAddress(stored) : ""
}

export function useLandingPageViewModel() {
    // Each load of the landing decides anew, `?instance=` reached in-app included.
    const arrival = useRouteContext({ from: "/", select: (context) => context.arrival })
    const arrivingAt = arrival.kind === "pick" ? arrival.address : null
    const [input, setInput] = useState(() => (arrivingAt ? displayAddress(arrivingAt) : initialAddress()))
    // Until the user types or the focus has moved once: the focus goes to the arrival's next step.
    const [arrived, setArrived] = useState(arrivingAt !== null)
    const [recent] = useState(() => loadRecentInstancesUseCase(getRecentInstancesPort()))
    const [resolved, setResolved] = useState<{ origin: string; info: InstanceInfo | null } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [handoff, setHandoff] = useState<Handoff | null>(null)
    const [taken, setTaken] = useState(arrival)
    // Taken during render, as React advises for a prop that changes.
    if (arrival !== taken) {
        setTaken(arrival)
        if (arrivingAt) {
            setInput(displayAddress(arrivingAt))
            setArrived(true)
            setError(null)
        }
    }

    const address = useMemo(() => instanceAddress(input), [input])
    // Taken once: a focus moved elsewhere afterwards is left there.
    const arrivalFocused = useCallback(() => setArrived(false), [])

    const router = useRouter()
    useEffect(() => {
        // A sign-in started here comes back to this URL. Not before the arrival is taken: that cancels the load deciding it.
        dropSearchParam(router, ARRIVAL_PARAM)
    }, [router, arrival])

    useEffect(() => {
        if (!address) return
        let current = true
        const timer = setTimeout(() => {
            resolveInstanceUseCase(address, getNodeInfoPort())
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

    const info = address && resolved?.origin === address.origin ? resolved.info : null
    const settled = address !== null && resolved?.origin === address.origin

    let resolution: { line: string; tone: ResolutionTone }
    if (error) resolution = { line: error, tone: "error" }
    else if (!input.trim() || (address && !settled)) resolution = { line: "", tone: "plain" }
    else if (!address) resolution = { line: "not a federated address yet", tone: "plain" }
    else if (!info) resolution = { line: `no Pīna'i instance at ${address.host}`, tone: "plain" }
    else resolution = { line: describeInstance(info), tone: "ok" }

    function changeAddress(value: string) {
        setError(null)
        setArrived(false)
        setInput(value)
    }

    function pickRecent(known: InstanceAddress) {
        changeAddress(displayAddress(known))
    }

    async function continueToInstance() {
        if (!address || !info || handoff) return
        setError(null)
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        setHandoff({ name: info.name, url: null, barDone: reducedMotion })
        try {
            const url = await prepareLoginUseCase(address.origin, getAuthPort(), getAuthPlatform())
            setHandoff((current) => current && { ...current, url })
        } catch {
            setHandoff(null)
            setError(`couldn't start the sign-in at ${address.host}`)
        }
    }

    function barDone() {
        setHandoff((current) => current && { ...current, barDone: true })
    }

    // The browser leaves once the bar has reached the instance and the request is ready, whichever is last.
    useEffect(() => {
        if (handoff?.url && handoff.barDone) getAuthPlatform().navigation.navigateTo(handoff.url)
    }, [handoff])

    return {
        input,
        changeAddress,
        resolution,
        resolvedHost: info && address ? address.host : null,
        // Once resolution settles: Continue for a Pīna'i instance, else the field to correct.
        arrivalFocus: !arrived || !settled ? null : info ? ("continue" as const) : ("field" as const),
        arrivalFocused,
        recent,
        pickRecent,
        continueToInstance,
        handoff: handoff && {
            name: handoff.name,
            endpoint: handoff.url && endpointOf(handoff.url),
        },
        barDone,
    }
}

/** The `/authorize` URL without its query: where the browser is going, not what it carries. */
function endpointOf(url: string): string {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
}
