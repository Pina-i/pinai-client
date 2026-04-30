import { useState } from "react"
import { AtSign, Check, Send } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"
import { Popover } from "@/presentation/molecules/Popover/Popover"
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
        setRequestStatus("sending")
        setRequestError("")
        try {
            await onSendFriendRequest(friendInput.trim())
            setRequestStatus("sent")
            setFriendInput("")
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
                    className="w-auto rounded-sm py-2 px-4 text-[12.5px] tracking-normal shadow-none aria-expanded:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_22%,transparent)]"
                >
                    + Add Friend
                </Button>
            }
            className="relative w-[380px] rounded-[var(--radius-lg)] border border-border-strong bg-popover px-4 pb-3.5 pt-4 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.02)]"
        >
            {/* Caret pointing up to the trigger */}
            <div className="pointer-events-none absolute -top-[7px] right-6 h-[14px] w-[14px] rotate-45 border-t border-l border-border-strong bg-popover" />

            {/* Header */}
            <div className="mb-2.5 flex items-baseline justify-between">
                <h3 className="title text-base font-medium text-foreground">Add a friend</h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    by address
                </span>
            </div>

            {/* Address input */}
            <div
                className={cn(
                    "flex h-10 items-center gap-2.5 rounded-[var(--radius)] border bg-input px-3 transition-all",
                    looksLikeAddress
                        ? "border-chat shadow-[0_0_0_3px_color-mix(in_oklab,var(--chat)_16%,transparent)]"
                        : "border-border",
                )}
            >
                <AtSign
                    className={cn(
                        "h-4 w-4 shrink-0",
                        looksLikeAddress ? "text-chat" : "text-muted-foreground",
                    )}
                />
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
                    className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
                />
                {looksLikeAddress && <Check className="h-4 w-4 shrink-0 text-chat" />}
            </div>

            {/* Status / resolution caption */}
            {requestStatus === "sent" ? (
                <p className="mt-1.5 font-mono text-[10.5px] text-success">✓ Friend request sent</p>
            ) : requestStatus === "error" ? (
                <p className="mt-1.5 font-mono text-[10.5px] text-destructive">{requestError}</p>
            ) : looksLikeAddress ? (
                <p className="mt-1.5 font-mono text-[10.5px] text-success">
                    ✓ resolved · {resolvedHost}
                </p>
            ) : null}

            {/* Send button */}
            <Button
                onPress={sendFriendRequest}
                isDisabled={!friendInput.trim() || requestStatus === "sending"}
                className="mt-3 gap-2 py-2.5 px-3.5 text-[13px] tracking-normal shadow-none"
            >
                {requestStatus === "sending" ? "Sending…" : "Send request"}
                <Send className="h-3.5 w-3.5" />
            </Button>

            {/* Divider */}
            <div className="my-3.5 flex items-center gap-2.5 text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.12em]">
                    or share yours
                </span>
                <div className="h-px flex-1 bg-border" />
            </div>

            {/* Your handle chip */}
            <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[color-mix(in_oklab,var(--chat)_35%,var(--border))] bg-[color-mix(in_oklab,var(--chat)_8%,var(--card))] px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-foreground">
                    {userAddress}
                </span>
                <Button
                    variant="primary"
                    onPress={copyAddress}
                    className="w-auto rounded-[5px] border border-chat bg-transparent px-2.5 py-1 text-[10.5px] font-normal tracking-normal text-chat shadow-none hover:bg-chat/10 hover:opacity-100 pressed:opacity-100"
                >
                    {copied ? "Copied" : "Copy"}
                </Button>
            </div>
        </Popover>
    )
}
