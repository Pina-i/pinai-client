import { X } from "lucide-react"
import { useState } from "react"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { cn } from "@/presentation/_libs/utils"

const tabs = [
    { id: "account", label: "My Account" },
    { id: "profiles", label: "Profiles" },
    { id: "privacy", label: "Privacy & Safety" },
    { id: "appearance", label: "Appearance" },
    { id: "notifications", label: "Notifications" },
    { id: "keybinds", label: "Keybinds" },
]

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    displayName: string
    username: string
    email?: string
    onLogout: () => void
}

export function SettingsModal({ isOpen, onClose, displayName, username, email, onLogout }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState("account")

    return (
        <Modal isOpen={isOpen} onClose={onClose} variant="fullscreen" isDismissable={false}>
            <div className="flex flex-1">
                {/* Sidebar */}
                <div className="flex w-52 shrink-0 flex-col items-end bg-card pr-2 pt-16">
                    <div className="flex w-44 flex-col gap-0.5">
                        <h3 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            User Settings
                        </h3>
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "px-2 py-1.5 text-left text-sm transition-colors",
                                    activeTab === tab.id
                                        ? "bg-accent font-medium text-foreground"
                                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                        <div className="my-2 h-px w-full bg-border" />
                        <button
                            onClick={onLogout}
                            className="px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                        >
                            Log Out
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-10 py-16">
                    <div className="max-w-xl">
                        {activeTab === "account" && (
                            <>
                                <h2 className="mb-6 text-xl font-bold text-foreground">My Account</h2>
                                <div className="border border-border bg-card p-4" style={{ boxShadow: "var(--shadow)" }}>
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-20 w-20 items-center justify-center bg-primary text-2xl font-bold text-primary-foreground">
                                            {displayName.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-foreground">{displayName}</h3>
                                            {email && <p className="text-sm text-muted-foreground">{email}</p>}
                                        </div>
                                    </div>
                                    <div className="mt-4 bg-sidebar p-4">
                                        {[
                                            { label: "Display Name", value: displayName },
                                            { label: "Username", value: username },
                                            { label: "Email", value: email ?? "Not set" },
                                        ].map((item) => (
                                            <div
                                                key={item.label}
                                                className="flex items-center justify-between border-b border-border py-3 last:border-b-0"
                                            >
                                                <div>
                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                        {item.label}
                                                    </p>
                                                    <p className="text-sm text-foreground">{item.value}</p>
                                                </div>
                                                <button className="bg-accent px-3 py-1 text-sm text-foreground hover:bg-accent/80">
                                                    Edit
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === "appearance" && (
                            <>
                                <h2 className="mb-6 text-xl font-bold text-foreground">Appearance</h2>
                                <div className="border border-border bg-card p-4">
                                    <h3 className="mb-3 text-sm font-semibold text-foreground">Theme</h3>
                                    <div className="flex gap-3">
                                        {["Dark", "Light", "Sync with OS"].map((theme) => (
                                            <button
                                                key={theme}
                                                className={cn(
                                                    "border px-4 py-2 text-sm transition-colors",
                                                    theme === "Light"
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-border text-muted-foreground hover:border-primary/30",
                                                )}
                                            >
                                                {theme}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab !== "account" && activeTab !== "appearance" && (
                            <>
                                <h2 className="mb-6 text-xl font-bold text-foreground">
                                    {tabs.find((t) => t.id === activeTab)?.label}
                                </h2>
                                <div className="border border-border bg-card p-6">
                                    <p className="text-sm text-muted-foreground">
                                        Settings for {tabs.find((t) => t.id === activeTab)?.label} would go here.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Close button */}
                <div className="flex shrink-0 flex-col items-center pr-6 pt-16">
                    <IconButton
                        onPress={onClose}
                        aria-label="Close settings"
                        className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-5 w-5" />
                    </IconButton>
                    <span className="mt-1 text-[11px] font-semibold text-muted-foreground">ESC</span>
                </div>
            </div>
        </Modal>
    )
}
