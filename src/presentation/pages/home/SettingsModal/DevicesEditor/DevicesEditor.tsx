import { Plus, RotateCcw } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { RecoveryPassphraseCard } from "@/presentation/molecules/RecoveryPassphraseCard/RecoveryPassphraseCard"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { cn } from "@/presentation/_libs/utils"

import { DeviceCard } from "./DeviceCard/DeviceCard"
import { useDevicesEditorViewModel } from "./DevicesEditor.viewmodel"

export function DevicesEditor() {
    const vm = useDevicesEditorViewModel()

    return (
        <div className="flex flex-1 flex-col bg-card">
            <div className="px-8 pt-[30px]">
                <div className="mb-3.5 flex items-center gap-[7px] text-[12px] text-muted-foreground">
                    <span>Settings</span>
                    <span className="text-border-strong">›</span>
                    <span className="font-medium text-foreground">Devices</span>
                </div>

                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="title m-0 text-[34px] font-normal leading-[1.1] tracking-[-0.018em] text-foreground">
                            Devices
                            <em className="italic text-chat">.</em>
                        </h1>
                        <p className="mt-1.5 max-w-[380px] text-[13px] leading-[1.5] text-muted-foreground">
                            These are the places you're signed in to Pīna'i. Sign out
                            anything that isn't you.
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Link
                            to="/onboarding/recovery-restore"
                            className={cn(
                                "inline-flex h-[34px] items-center gap-1.5 rounded-md border border-border-strong bg-transparent px-3",
                                "font-sans text-[12px] text-foreground hover:bg-accent/40",
                            )}
                        >
                            <RotateCcw className="h-3 w-3" strokeWidth={2} />
                            Restore history
                        </Link>
                        <button
                            type="button"
                            disabled
                            title="Pairing arrives in the next release."
                            className={cn(
                                "inline-flex h-[34px] items-center gap-1.5 rounded-md bg-chat px-3",
                                "font-sans text-[12px] font-semibold text-primary-foreground",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                        >
                            <Plus className="h-3 w-3" strokeWidth={2.6} />
                            Pair new
                        </button>
                    </div>
                </div>
            </div>

            <ScrollArea className="flex-1 px-8 pb-8 pt-3.5">
                {!vm.isPassphraseLoading && (
                    <div className="mb-3">
                        <RecoveryPassphraseCard
                            words={vm.passphraseWords}
                            onClear={() => void vm.onClearRecovery()}
                            isClearing={vm.isClearingRecovery}
                        />
                    </div>
                )}

                {vm.isLoading && (
                    <div className="rounded-[10px] border border-dashed border-border bg-[color-mix(in_oklab,var(--card)_50%,transparent)] px-3.5 py-6 text-center text-[12px] italic text-muted-foreground font-serif">
                        Loading devices…
                    </div>
                )}

                {vm.error != null && !vm.isLoading && (
                    <div className="rounded-[10px] border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-[12px] text-destructive">
                        Could not load devices.
                    </div>
                )}

                {vm.rows && vm.rows.length === 0 && !vm.isLoading && (
                    <div className="rounded-[10px] border border-dashed border-border bg-[color-mix(in_oklab,var(--card)_50%,transparent)] px-3.5 py-6 text-center text-[12px] italic text-muted-foreground font-serif">
                        No devices yet — sign in on another device to see it here.
                    </div>
                )}

                {vm.rows && vm.rows.length > 0 && (
                    <div className="flex flex-col gap-2">
                        {vm.rows.map((d) => (
                            <DeviceCard
                                key={d.device_id}
                                device={d}
                                onRevoke={() => void vm.onRevokeDevice(d.device_id)}
                                isRevoking={vm.revokingDeviceId === d.device_id}
                            />
                        ))}
                    </div>
                )}

                <p className="mt-3 border-t border-border pt-2.5 font-serif text-[10.5px] italic leading-[1.5] text-muted-foreground">
                    Don't recognize a device? Sign it out — your passphrase still
                    works everywhere else.
                </p>
            </ScrollArea>
        </div>
    )
}
