import { useEffect, useState } from "react"
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router"

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

export interface SettingsModalViewModel {
    activeSection: SettingsSection
    selectSection: (section: SettingsSection) => void
}

export function useSettingsModalViewModel(): SettingsModalViewModel {
    // Read as the shell mounts, which a sign-in coming back to it always does.
    const asked = useLocation({ select: (l) => askedIn(l.searchStr) })
    const [activeSection, setActiveSection] = useState<SettingsSection>(asked ?? "profile")
    const setShowSettings = useAppStore((s) => s.setShowSettings)
    const router = useRouter()
    const navigate = useNavigate()

    useEffect(() => {
        if (!asked) return
        setShowSettings(true)
        const { pathname, searchStr } = router.state.location
        const search = new URLSearchParams(searchStr)
        search.delete(PARAM)
        const rest = search.toString()
        void navigate({ href: rest ? `${pathname}?${rest}` : pathname, replace: true })
    }, [asked, setShowSettings, router, navigate])

    return { activeSection, selectSection: setActiveSection }
}
