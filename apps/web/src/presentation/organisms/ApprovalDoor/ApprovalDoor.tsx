import { Check, Laptop, ShieldCheck } from "lucide-react"

import { Button } from "@/presentation/atoms/Button/Button"
import { OtpInput } from "@/presentation/atoms/OtpInput/OtpInput"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { RecentSignInModal } from "@/presentation/molecules/RecentSignInModal/RecentSignInModal"
import { cn } from "@/presentation/_libs/utils"

import { failureWording, useApprovalDoorViewModel } from "./ApprovalDoor.viewmodel"

/**
 * The approval prompt over the app while another device of the account asks: "Door"
 * (`identity-provider/docs/plans/2026-11-02-history-key-sharing-design.md § 5.3`).
 */
export function ApprovalDoor() {
    const vm = useApprovalDoorViewModel()
    const view = vm.view
    const working = view?.stage === "working"
    const approved = view?.stage === "approved"

    return (
        <>
            <Modal
                isOpen={view !== null}
                onClose={vm.onClose}
                isDismissable={!working}
                isKeyboardDismissDisabled={working}
                label={vm.title}
            >
                <div className={cn(modalSurface, "w-[470px] gap-5 px-[30px] pb-[22px] pt-7 max-[520px]:px-5")}>
                    <div>
                        <p className="eye">— New sign-in</p>
                        <h2 className="title m-0 mt-1.5 text-[32px] font-normal leading-[1.1] tracking-[-0.015em] text-foreground">
                            {approved ? "Approved." : "Is this you?"}
                        </h2>
                    </div>

                    <div className="flex items-center gap-3.5 rounded-[16px] border border-line bg-surf px-4 py-3.5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-acc-soft text-acc">
                            <Laptop className="h-[22px] w-[22px]" strokeWidth={1.9} aria-hidden />
                        </span>
                        <span className="min-w-0">
                            <span className="title block truncate text-[18px] font-semibold text-foreground">{vm.device}</span>
                            <span className="fact fact-plain mt-[3px] block">{vm.signedIn}</span>
                        </span>
                    </div>

                    <div role="status" aria-live="polite">
                        {approved && (
                            <p className="m-0 flex gap-2.5 text-[13px] leading-[1.55] text-muted-foreground">
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-on" strokeWidth={2.2} aria-hidden />
                                <span>{vm.device} is one of your devices now.</span>
                            </p>
                        )}
                        {working && <p className="m-0 text-[12.5px] text-muted-foreground">Checking the code with {vm.device}…</p>}
                    </div>

                    {!approved && (
                        <>
                            <div>
                                {view?.note === "wrong-code" && (
                                    <p className="m-0 mb-2 text-[12.5px] text-dnd">That code didn't match — type the new one it shows.</p>
                                )}
                                <OtpInput
                                    label="Type the code it shows"
                                    value={vm.code}
                                    onChange={vm.setCode}
                                    groupSize={3}
                                    size="lg"
                                    autoFocus
                                    disabled={view?.stage !== "entry"}
                                />
                            </div>
                            <p className="m-0 flex gap-2.5 text-[12.5px] leading-[1.55] text-muted-foreground">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-acc" strokeWidth={1.9} aria-hidden />
                                <span>Approving gives it your conversations and your history. Approve only a device you have in hand.</span>
                            </p>
                        </>
                    )}

                    <div role="alert">
                        {view?.stage === "failed" && view.failure && (
                            <p className="m-0 text-[12.5px] leading-[1.55] text-dnd">{failureWording(view.failure, vm.device)}</p>
                        )}
                        {vm.error && <p className="m-0 text-[12.5px] text-dnd">{vm.error}</p>}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                        {view?.stage === "entry" && (
                            <>
                                <Button
                                    variant="ghost"
                                    onPress={vm.onNotMe}
                                    isDisabled={vm.isSigningOut}
                                    className="px-1 py-2 text-[12.5px] text-dnd no-underline hover:text-dnd hover:underline"
                                >
                                    {vm.isSigningOut ? "Signing it out…" : "Not me — sign it out"}
                                </Button>
                                <Button size="inline" onPress={vm.onApprove} isDisabled={!vm.canApprove}>
                                    Approve
                                </Button>
                            </>
                        )}
                        {working && (
                            <>
                                <Button size="inline" variant="secondary" onPress={vm.onCancel}>
                                    Cancel
                                </Button>
                                <Button size="inline" isDisabled>
                                    Approving…
                                </Button>
                            </>
                        )}
                        {(approved || view?.stage === "failed") && (
                            <>
                                <span />
                                <Button size="inline" variant="secondary" onPress={vm.onClose}>
                                    {approved ? "Done" : "Close"}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </Modal>
            <RecentSignInModal
                action={vm.recentSignIn.asking}
                host={vm.recentSignIn.host}
                isLeaving={vm.recentSignIn.isLeaving}
                onCancel={vm.recentSignIn.dismiss}
                onContinue={vm.recentSignIn.signInAgain}
            />
        </>
    )
}
