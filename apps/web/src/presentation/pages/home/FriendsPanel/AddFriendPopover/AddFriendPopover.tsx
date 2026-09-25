import { useState } from "react"
import { AtSign, Check, Plus, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/presentation/atoms/Button/Button"
import { Popover, PopoverCaret } from "@/presentation/molecules/Popover/Popover"
import { popoverSurface } from "@/presentation/molecules/Popover/popover-surface"
import { cn } from "@/presentation/_libs/utils"

interface AddFriendPopoverProps {
    userAddress: string
    onSendFriendRequest: (address: string) => Promise<unknown>
}

export function AddFriendPopover({ userAddress, onSendFriendRequest }: AddFriendPopoverProps) {
    const [friendInput, setFriendInput] = useState("")
    const [requestStatus, setRequestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
    const [requestError, setRequestError] = useState("")
    const [copied, setCopied] = useState(false)

    const looksLikeAddress = /\S+@\S+/.test(friendInput.trim())
    const resolvedHost = friendInput.split("@")[1]?.trim()

    function copyAddress() {
        navigator.clipboard.writeText(userAddress)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    async function sendFriendRequest() {
        if (!friendInput.trim()) return
        const target = friendInput.trim()
        setRequestStatus("sending")
        setRequestError("")
        try {
            await onSendFriendRequest(target)
            setRequestStatus("sent")
            setFriendInput("")
            toast.success(`Friend request sent to ${target}`)
        } catch (e) {
            setRequestStatus("error")
            setRequestError(e instanceof Error ? e.message : "Failed to send request")
        }
    }

    return (
        <Popover
            placement="bottom end"
            offset={12}
            trigger={
                <Button
                    variant="primary"
                    size="inline"
                    className="flex-none aria-expanded:shadow-[0_0_0_3px_color-mix(in_oklab,var(--action)_25%,transparent)]"
                >
                    <Plus className="h-[15px] w-[15px]" />
                    Add friend
                </Button>
            }
            className={cn(popoverSurface, "relative w-[380px] px-4 pb-3.5 pt-4")}
        >
            <PopoverCaret side="up" className="right-[58px]" />

            <div className="mb-2.5 flex items-baseline justify-between gap-2.5">
                <h3 className="title text-[17px] font-normal tracking-[-0.005em] text-foreground">Add a friend</h3>
                <span className="eye">by address</span>
            </div>

            <div
                className={cn(
                    "flex h-[42px] items-center gap-2.5 rounded-[12px] border px-3.5 transition-[border-color,box-shadow] duration-150",
                    looksLikeAddress
                        ? "border-acc bg-surf2 text-acc shadow-[0_0_0_3px_var(--accsoft)]"
                        : "border-line2 bg-surf2 text-muted-foreground",
                )}
            >
                <AtSign className="h-4 w-4 shrink-0" />
                <input
                    autoFocus
                    value={friendInput}
                    onChange={(e) => {
                        setFriendInput(e.target.value)
                        if (requestStatus !== "idle") {
                            setRequestStatus("idle")
                            setRequestError("")
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") sendFriendRequest()
                    }}
                    placeholder="alice@idp.example.com"
                    className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-foreground placeholder:text-muted-foreground outline-none"
                />
                {looksLikeAddress && <Check className="h-4 w-4 shrink-0" />}
            </div>

            {requestStatus === "sent" ? (
                <p className="mt-1.5 font-mono text-[10.5px] text-on">✓ Friend request sent</p>
            ) : requestStatus === "error" ? (
                <p className="mt-1.5 font-mono text-[10.5px] text-dnd">{requestError}</p>
            ) : looksLikeAddress ? (
                <p className="mt-1.5 font-mono text-[10.5px] text-on">✓ resolved · {resolvedHost}</p>
            ) : null}

            <Button
                onPress={sendFriendRequest}
                isDisabled={!friendInput.trim() || requestStatus === "sending"}
                className="mt-3 px-3.5 py-2.5 text-[13px]"
            >
                {requestStatus === "sending" ? "Sending…" : "Send request"}
                <Send className="h-3.5 w-3.5" />
            </Button>

            <div className="my-3.5 flex items-center gap-2.5">
                <i className="h-px flex-1 bg-line2" />
                <span className="eye">or share yours</span>
                <i className="h-px flex-1 bg-line2" />
            </div>

            <div className="flex items-center gap-2 rounded-[12px] border border-dashed border-[color-mix(in_oklab,var(--acc)_40%,var(--line2))] bg-[color-mix(in_oklab,var(--acc)_8%,var(--surf))] py-2 pl-3 pr-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-foreground">
                    {userAddress}
                </span>
                <button
                    type="button"
                    onClick={copyAddress}
                    className="shrink-0 cursor-pointer rounded-full border border-acc bg-transparent px-[11px] py-1 text-[11px] text-acc transition-colors duration-150 hover:bg-acc-soft"
                >
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
        </Popover>
    )
}
