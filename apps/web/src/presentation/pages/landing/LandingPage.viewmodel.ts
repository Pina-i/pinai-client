import { useEffect, useMemo, useState } from "react"
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
    const [input, setInput] = useState(initialAddress)
    const [recent] = useState(() => loadRecentInstancesUseCase(getRecentInstancesPort()))
    const [resolved, setResolved] = useState<{ origin: string; info: InstanceInfo | null } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [handoff, setHandoff] = useState<Handoff | null>(null)

    const address = useMemo(() => instanceAddress(input), [input])

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

    function openAgain() {
        if (handoff?.url) getAuthPlatform().navigation.navigateTo(handoff.url)
    }

    return {
        input,
        changeAddress,
        resolution,
        resolvedHost: info && address ? address.host : null,
        recent,
        pickRecent,
        continueToInstance,
        handoff: handoff && {
            name: handoff.name,
            endpoint: handoff.url && endpointOf(handoff.url),
            // The desktop app hands the request to the system browser and stays, until the deep link brings it back.
            inBrowser: !getAuthPlatform().browserSession && handoff.url !== null && handoff.barDone,
        },
        barDone,
        openAgain,
        cancelHandoff: () => setHandoff(null),
    }
}

/** The `/authorize` URL without its query: where the browser is going, not what it carries. */
function endpointOf(url: string): string {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
}
