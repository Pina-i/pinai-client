import { LogOut, Plus, RotateCcw } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { RecoveryPassphraseCard } from "@/presentation/molecules/RecoveryPassphraseCard/RecoveryPassphraseCard"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { cn } from "@/presentation/_libs/utils"

import { DeviceCard } from "./DeviceCard/DeviceCard"
import { useDevicesEditorViewModel } from "./DevicesEditor.viewmodel"

const actionPill = cn(
    "inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border px-[13px]",
    "font-sans text-[12px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
)

const statePanel =
    "rounded-[14px] border border-dashed border-line2 bg-[color-mix(in_oklab,var(--surf)_50%,transparent)] px-3.5 py-6 text-center title text-[12px] italic text-muted-foreground"

export function DevicesEditor() {
    const vm = useDevicesEditorViewModel()

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-8 pt-[30px] max-[1040px]:px-5 max-[1040px]:pt-6">
                <div className="mb-3.5 flex items-center gap-[7px] text-[12px] text-muted-foreground">
                    <span>Settings</span>
                    <span className="text-line2">›</span>
                    <span className="font-medium text-foreground">Devices</span>
                </div>

                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="title m-0 text-[34px] font-normal leading-[1.1] tracking-[-0.018em] text-foreground">
                            Devices
                            <em className="italic text-acc">.</em>
                        </h1>
                        <p className="mt-1.5 max-w-[380px] text-[13px] leading-[1.5] text-muted-foreground">
                            These are the places you're signed in to Pīna'i. Sign out
                            anything that isn't you.
                        </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void vm.onSignOutOthers()}
                            disabled={vm.isSigningOutOthers}
                            className={cn(
                                actionPill,
                                "cursor-pointer border-line2 bg-transparent text-foreground hover:bg-surf2",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                        >
                            <LogOut className="h-3 w-3" strokeWidth={2} />
                            {vm.isSigningOutOthers ? "Signing out…" : "Sign out other devices"}
                        </button>
                        <Link
                            to="/onboarding/recovery-restore"
                            className={cn(actionPill, "border-line2 bg-transparent text-foreground hover:bg-surf2")}
                        >
                            <RotateCcw className="h-3 w-3" strokeWidth={2} />
                            Restore history
                        </Link>
                        <button
                            type="button"
                            disabled
                            title="Pairing arrives in the next release."
                            className={cn(
                                actionPill,
                                "border-transparent bg-action font-semibold text-action-foreground",
                                "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                        >
                            <Plus className="h-3 w-3" strokeWidth={2.6} />
                            Pair new
                        </button>
                    </div>
                </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 px-8 pb-8 pt-3.5 max-[1040px]:px-5 max-[1040px]:pb-6 max-[1040px]:pt-3">
                {!vm.isPassphraseLoading && (
                    <div className="mb-3">
                        <RecoveryPassphraseCard
                            words={vm.passphraseWords}
                            onClear={() => void vm.onClearRecovery()}
                            isClearing={vm.isClearingRecovery}
                        />
                    </div>
                )}

                {vm.isLoading && <div className={statePanel}>Loading devices…</div>}

                {vm.error != null && !vm.isLoading && (
                    <div className="rounded-[14px] border border-[color-mix(in_oklab,var(--dnd)_40%,transparent)] bg-[color-mix(in_oklab,var(--dnd)_10%,transparent)] px-3.5 py-3 text-[12px] text-dnd">
                        Could not load devices.
                    </div>
                )}

                {vm.rows && vm.rows.length === 0 && !vm.isLoading && (
                    <div className={statePanel}>No devices yet — sign in on another device to see it here.</div>
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

                <p className="title mt-3 border-t border-line pt-2.5 text-[10.5px] italic leading-[1.5] text-muted-foreground">
                    Don't recognize a device? Sign it out — your passphrase still
                    works everywhere else.
                </p>
            </ScrollArea>
        </div>
    )
}
