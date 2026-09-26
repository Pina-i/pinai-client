import type { ReactNode } from "react"
import { Bell, Headphones, Laptop, Lock, MessageSquare, Settings as SettingsIcon, ShieldCheck, Sparkles, Sun } from "lucide-react"
import type { UserProfile } from "@pinai/domain/models/auth"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { AppearanceEditor } from "./AppearanceEditor/AppearanceEditor"
import { DevicesEditor } from "./DevicesEditor/DevicesEditor"
import { IdentityTile } from "./IdentityTile/IdentityTile"
import { PlaceholderEditor } from "./PlaceholderEditor/PlaceholderEditor"
import { ProfileEditor } from "./ProfileEditor/ProfileEditor"
import { SecurityEditor } from "./SecurityEditor/SecurityEditor"
import { SettingsHeader } from "./SettingsHeader/SettingsHeader"
import { SettingTile } from "./SettingTile/SettingTile"
import { useSettingsModalViewModel, type SettingsSection } from "./SettingsModal.viewmodel"

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    user: UserProfile
    onLogout: () => void
}

interface SectionDescriptor {
    id: SettingsSection
    label: string
    title: string
    description: string
    icon: ReactNode
    preview?: ReactNode
}

const ICON_PROPS = "h-3.5 w-3.5"
const FACT_PREVIEW = "font-mono text-[10.5px]"

const SECTIONS: SectionDescriptor[] = [
    {
        id: "profile",
        label: "Profile",
        title: "The face you put forward.",
        description: "Avatar, banner, bio, pronouns.",
        icon: <Sparkles className={ICON_PROPS} />,
        preview: (
            <span className="title text-[11.5px] italic text-muted-foreground">
                “Designer at Kauai Studio…”
            </span>
        ),
    },
    {
        id: "security",
        label: "Security",
        title: "Two-factor authentication.",
        description: "App-based 2FA and recovery codes.",
        icon: <ShieldCheck className={ICON_PROPS} />,
        preview: <span className={`${FACT_PREVIEW} text-on`}>● Authenticator app</span>,
    },
    {
        id: "privacy",
        label: "Privacy & safety",
        title: "Who can reach you, and how.",
        description: "Who can DM you, friend requests, blocked users.",
        icon: <Lock className={ICON_PROPS} />,
        preview: <span className={`${FACT_PREVIEW} text-on`}>● Friends-of-friends</span>,
    },
    {
        id: "appearance",
        label: "Appearance",
        title: "How the room looks.",
        description: "Theme, density, font, accent.",
        icon: <Sun className={ICON_PROPS} />,
        preview: (
            <span className="flex gap-1">
                {["bg-acc", "bg-sec", "bg-background"].map((c) => (
                    <span key={c} className={`h-3 w-3 rounded-[3px] border border-line2 ${c}`} />
                ))}
            </span>
        ),
    },
    {
        id: "notifications",
        label: "Notifications",
        title: "What pings you, when, and how loud.",
        description: "What pings you, when, and how loud.",
        icon: <Bell className={ICON_PROPS} />,
        preview: <span className={`${FACT_PREVIEW} text-sec`}>3 categories on</span>,
    },
    {
        id: "voice",
        label: "Voice & video",
        title: "Microphone, audio, push-to-talk.",
        description: "Microphone, audio, push-to-talk.",
        icon: <Headphones className={ICON_PROPS} />,
        preview: (
            <span className="inline-flex h-2 items-end gap-[1.5px]">
                {[0.4, 0.7, 0.5, 0.9, 0.6].map((h, i) => (
                    <span
                        key={i}
                        className="w-[2px] rounded-[1px] bg-sec"
                        style={{ height: `${h * 100}%` }}
                    />
                ))}
            </span>
        ),
    },
    {
        id: "keybinds",
        label: "Keybinds",
        title: "Shortcuts you can rewire.",
        description: "Shortcuts you can rewire.",
        icon: <SettingsIcon className={ICON_PROPS} />,
        preview: <span className={`${FACT_PREVIEW} text-muted-foreground`}>⌘K · ⌘\\ · ⇧⌘M</span>,
    },
    {
        id: "devices",
        label: "Devices",
        title: "Devices signed in to Pīna'i.",
        description: "Phones and laptops you're signed in on.",
        icon: <Laptop className={ICON_PROPS} />,
        preview: <span className={`${FACT_PREVIEW} text-acc`}>manage signed-in devices</span>,
    },
    {
        id: "connections",
        label: "Connected servers",
        title: "Federated identities you’ve linked.",
        description: "Federated identities you've linked.",
        icon: <MessageSquare className={ICON_PROPS} />,
        preview: <span className={`${FACT_PREVIEW} text-muted-foreground`}>kauai · studio · lab</span>,
    },
]

export function SettingsModal({ isOpen, onClose, user, onLogout }: SettingsModalProps) {
    const { activeSection, selectSection } = useSettingsModalViewModel()

    const displayName = user.display_name ?? user.preferred_username
    const initials = displayName.slice(0, 2).toUpperCase()
    const handle = user.preferred_username
    const host = user.address.split("@")[1] ?? ""
    const activeDescriptor = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]

    return (
        <Modal isOpen={isOpen} onClose={onClose} variant="fullscreen" isDismissable label="Settings">
            <div className="flex h-screen w-full max-[700px]:flex-col max-[700px]:overflow-y-auto">
                {/* LEFT — landing grid */}
                <div className="relative flex min-w-0 flex-[1.05] flex-col border-r border-line max-[700px]:flex-none max-[700px]:border-b max-[700px]:border-r-0">
                    <ScrollArea className="min-h-0 flex-1 px-8 pb-7 pt-[30px] max-[1040px]:px-5 max-[1040px]:py-6 max-[700px]:overflow-visible">
                        <SettingsHeader onClose={onClose} />

                        <IdentityTile
                            displayName={displayName}
                            handle={handle}
                            email={user.email}
                            initials={initials}
                            avatarUrl={user.avatar_url}
                            onManageAccount={() => selectSection("profile")}
                        />

                        <div className="grid grid-cols-2 gap-3 max-[1040px]:grid-cols-1">
                            {SECTIONS.map((s) => (
                                <SettingTile
                                    key={s.id}
                                    icon={s.icon}
                                    label={s.label}
                                    description={s.description}
                                    preview={s.preview}
                                    state={s.id === activeSection ? "active" : "idle"}
                                    onPress={() => selectSection(s.id)}
                                />
                            ))}
                            <SettingTile
                                icon={<Lock className={ICON_PROPS} />}
                                label="Sign out"
                                description="End this session on this device."
                                state="danger"
                                onPress={onLogout}
                            />
                        </div>

                        <p className="mt-[18px] text-right font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                            Pīna'i v0.9 · {host || "kauai.pinai"} · ESC to close
                        </p>
                    </ScrollArea>
                </div>

                {/* RIGHT — drill-in editor */}
                <div className="relative flex min-w-0 flex-[0.95] flex-col bg-surf max-[700px]:min-h-[420px] max-[700px]:flex-none">
                    {activeDescriptor.id === "profile" ? (
                        <ProfileEditor user={user} />
                    ) : activeDescriptor.id === "security" ? (
                        <SecurityEditor />
                    ) : activeDescriptor.id === "devices" ? (
                        <DevicesEditor />
                    ) : activeDescriptor.id === "appearance" ? (
                        <AppearanceEditor />
                    ) : (
                        <PlaceholderEditor
                            sectionLabel={activeDescriptor.label}
                            sectionTitle={activeDescriptor.title}
                        />
                    )}
                </div>
            </div>
        </Modal>
    )
}
