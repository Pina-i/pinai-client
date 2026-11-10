import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useLocation, useRouter } from "@tanstack/react-router"

import type { InstanceInfo } from "@pinai/domain/models/instance"
import { managedInstanceUseCase } from "@pinai/domain/usecases/instance/managed-instance.usecase"
import { getNodeInfoPort } from "@/ioc"
import { IN_DESKTOP_APP } from "@/presentation/_libs/client-download"
import { dropSearchParam } from "@/presentation/_libs/search-param"
import { useDeviceRoster } from "@/presentation/hooks/use-device-roster"
import { useAppStore } from "@/store/store"

const SECTIONS = [
    "profile",
    "security",
    "privacy",
    "appearance",
    "notifications",
    "voice",
    "keybinds",
    "devices",
    "connections",
    "instance",
] as const

export type SettingsSection = (typeof SECTIONS)[number]

/** `?settings=<section>` opens Settings on that section, as the page it was asked from. */
const PARAM = "settings"

/** Where the app is, with Settings open on `section`: where a sign-in started from there comes back to. */
export function settingsHref(location: { pathname: string; searchStr: string }, section: SettingsSection): string {
    const search = new URLSearchParams(location.searchStr)
    search.set(PARAM, section)
    return `${location.pathname}?${search.toString()}`
}

function askedIn(searchStr: string): SettingsSection | null {
    const asked = new URLSearchParams(searchStr).get(PARAM)
    return SECTIONS.find((section) => section === asked) ?? null
}

/** Settings → Instance, an admin's: unknown until NodeInfo answers. */
export type InstancePanel = { kind: "unknown" } | { kind: "hidden" } | { kind: "shown"; info: InstanceInfo }

export interface SettingsModalViewModel {
    selectSection: (section: SettingsSection) => void
    instance: InstancePanel
    /**
     * The section the right pane shows: Profile in place of an Instance panel the account doesn't
     * have, `null` while that is unknown — no panel, and no admin request, before NodeInfo answers.
     */
    shownSection: SettingsSection | null
    /** A waiting seat's exchange is under way: Escape doesn't close Settings, as it doesn't close the Door. */
    isAnswering: boolean
    /** Devices waiting for the user, for the Devices tile. */
    waitingCount: number
    /** Notifications holds the desktop app's keep-running switch, and only that. */
    offersKeepRunning: boolean
}

export function useSettingsModalViewModel(): SettingsModalViewModel {
    // A sign-in coming back reads it as the shell mounts; a notice's link, while the shell is up.
    const asked = useLocation({ select: (l) => askedIn(l.searchStr) })
    const [activeSection, setActiveSection] = useState<SettingsSection>(asked ?? "profile")
    const [taken, setTaken] = useState(asked)
    if (asked && asked !== taken) {
        setTaken(asked)
        setActiveSection(asked)
    }
    const setShowSettings = useAppStore((s) => s.setShowSettings)
    const router = useRouter()
    const instance = useInstancePanel()
    const roster = useDeviceRoster()

    useEffect(() => {
        if (!asked) return
        setShowSettings(true)
        dropSearchParam(router, PARAM)
    }, [asked, setShowSettings, router])

    const shownSection =
        activeSection !== "instance"
            ? activeSection
            : instance.kind === "shown"
              ? "instance"
              : instance.kind === "hidden"
                ? "profile"
                : null

    return {
        selectSection: setActiveSection,
        instance,
        shownSection,
        isAnswering: roster.seats.seat?.stage === "working",
        waitingCount: roster.waiting.length,
        offersKeepRunning: IN_DESKTOP_APP,
    }
}

function useInstancePanel(): InstancePanel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const admin = useAppStore((s) => s.user?.admin === true)
    const query = useQuery({
        queryKey: ["managed-instance", idpUrl, admin],
        queryFn: () => managedInstanceUseCase(idpUrl!, admin, getNodeInfoPort()),
        enabled: idpUrl !== null && admin,
        staleTime: 60_000,
    })
    if (!idpUrl || !admin || query.isError) return { kind: "hidden" }
    if (query.data === undefined) return { kind: "unknown" }
    return query.data ? { kind: "shown", info: query.data } : { kind: "hidden" }
}
