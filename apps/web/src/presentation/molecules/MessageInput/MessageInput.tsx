import { Plus, Reply, Send, Smile, X } from "lucide-react"
import { memo, useEffect, useRef, useState, type RefObject } from "react"
import { Input, TextField } from "react-aria-components"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { EmojiPickerPopover } from "@/presentation/molecules/EmojiPickerPopover/EmojiPickerPopover"
import { GifPopover } from "@/presentation/molecules/GifPopover/GifPopover"
import { Popover } from "@/presentation/molecules/Popover/Popover"
import { cn } from "@/presentation/_libs/utils"
import { ComposerChipRow } from "./ComposerChipRow"
import { ComposerUploadRow } from "./ComposerUploadRow"
import {
    MAX_ATTACHMENTS_PER_MESSAGE,
    useMessageInputViewModel,
    type MessageInputHandle,
} from "./MessageInput.viewmodel"

interface MessageInputProps {
    placeholder: string
    /**
     * Called when the user submits a message. `attachmentIds` is the list of
     * orphan attachment IDs the composer has uploaded — empty when the message
     * is text-only. Caller is responsible for calling `POST /api/dm` (or the
     * WS shortcut for text-only messages) with these IDs.
     */
    onSend: (content: string, attachmentIds: string[]) => void | Promise<void>
    onType?: () => void
    replyTo?: { id: string; content: string; author: string } | null
    onCancelReply?: () => void
    /** Imperative handle so the page-level drag-drop can pump dropped files in. */
    handleRef?: RefObject<MessageInputHandle | null>
}

// Memoised: the page re-renders on every incoming message; the composer's props don't change then.
export const MessageInput = memo(function MessageInput({
    placeholder,
    onSend,
    onType,
    replyTo,
    onCancelReply,
    handleRef,
}: MessageInputProps) {
    // See VerifyEmailPage: a ref inside the viewmodel object taints every
    // other property read on it for `react-hooks/refs`.
    const { pickedFileInputRef, ...vm } = useMessageInputViewModel({ onSend, onType, handleRef })

    // Controlled state for the emoji + GIF popovers so picking one snaps
    // it shut. React Aria's `DialogTrigger` does NOT auto-close on inner
    // clicks unless the click closes via the standard form-submit / link
    // path — a tile/grid cell is a plain button, so we toggle the open
    // state ourselves.
    const [emojiOpen, setEmojiOpen] = useState(false)
    const [gifOpen, setGifOpen] = useState(false)

    const textInputRef = useRef<HTMLInputElement | null>(null)

    /**
     * Return focus to the message input after a popover closes —
     * regardless of how (emoji pick, GIF pick, Escape, outside click).
     *
     * Watching the open-state edge in a `useEffect` instead of calling
     * a `setTimeout(0)` inline at the pick site puts us reliably AFTER
     * React Aria's `DialogTrigger` focus-restoration to the trigger
     * button. The GIF case in particular was unreliable inline because
     * the picker's `onClick` is async (`await fetch(gif)` for the file
     * bytes) — by the time `setGifOpen(false)` fired, the timing
     * relative to RA's internal restore had drifted.
     */
    const prevEmojiOpenRef = useRef(false)
    const prevGifOpenRef = useRef(false)
    useEffect(() => {
        const justClosed =
            (prevEmojiOpenRef.current && !emojiOpen) || (prevGifOpenRef.current && !gifOpen)
        prevEmojiOpenRef.current = emojiOpen
        prevGifOpenRef.current = gifOpen
        if (!justClosed) return
        const el = textInputRef.current
        if (!el) return
        // One rAF after the effect commit to make sure RA's
        // restoration round trip is fully done.
        const id = requestAnimationFrame(() => {
            el.focus()
            // Park the caret at the end so the next keystroke continues
            // the message rather than landing mid-word.
            const end = el.value.length
            el.setSelectionRange(end, end)
        })
        return () => cancelAnimationFrame(id)
    }, [emojiOpen, gifOpen])

    // Decide between progress-row strip (any upload mid-flight) and chip strip
    // (everything ready). Empty string short-circuits the whole strip.
    const stripMode: "uploading" | "ready" | "none" =
        vm.pending.length === 0 ? "none" : vm.isUploading ? "uploading" : "ready"

    const inFlightCount = vm.pending.filter((p) => !p.attachment && !p.error).length
    const composerPlaceholder = vm.isUploading
        ? `Uploading ${inFlightCount} file${inFlightCount === 1 ? "" : "s"}…`
        : placeholder

    const hasTray = !!replyTo || stripMode !== "none"

    return (
        <div className="shrink-0">
            {/* Hidden file input — triggered by the plus icon. */}
            <input
                ref={pickedFileInputRef}
                type="file"
                multiple
                onChange={vm.onFileInputChange}
                className="hidden"
            />

            {/* A pill can't hold rows, so the reply and the attachments sit
                in a tray above it. */}
            {hasTray && (
                <div className="mb-2 flex flex-col gap-2 rounded-[18px] border border-line bg-surf p-2.5 backdrop-blur-[14px]">
                    {replyTo && (
                        <div className="flex items-center gap-2 rounded-[12px] bg-surf2 px-3 py-2 text-[12px] text-muted-foreground">
                            <Reply className="h-3.5 w-3.5 shrink-0 text-acc" />
                            <span className="title shrink-0 text-[13px] font-semibold text-foreground">{replyTo.author}</span>
                            <span className="flex-1 truncate">{replyTo.content}</span>
                            <IconButton variant="ghost" aria-label="Cancel reply" onPress={onCancelReply} className="h-6 w-6">
                                <X className="h-3.5 w-3.5" />
                            </IconButton>
                        </div>
                    )}

                    {stripMode === "uploading" && (
                        <div className="flex flex-col gap-1.5">
                            {vm.pending.map((p) => (
                                <ComposerUploadRow
                                    key={p.localId}
                                    pending={p}
                                    onRemove={() => vm.onRemovePending(p.localId)}
                                />
                            ))}
                        </div>
                    )}

                    {stripMode === "ready" && (
                        <div className="flex flex-wrap gap-1.5">
                            {vm.pending.map((p) => (
                                <ComposerChipRow
                                    key={p.localId}
                                    pending={p}
                                    onRemove={() => vm.onRemovePending(p.localId)}
                                />
                            ))}
                            {vm.pending.length < MAX_ATTACHMENTS_PER_MESSAGE && (
                                <button
                                    type="button"
                                    onClick={vm.onPickClick}
                                    className={cn(
                                        "cursor-pointer rounded-full border border-dashed border-line2 bg-transparent px-3 py-1",
                                        "font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    + add file
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center gap-3 rounded-full border border-line bg-surf px-4 py-3 text-[14px] text-muted-foreground backdrop-blur-[14px]">
                <IconButton
                    variant="ghost"
                    onPress={vm.onPickClick}
                    aria-label="Attach files"
                    isDisabled={vm.pending.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                >
                    <Plus className="h-[18px] w-[18px]" />
                </IconButton>

                <TextField
                    value={vm.value}
                    onChange={vm.setValue}
                    aria-label="Message"
                    className="min-w-0 flex-1"
                >
                    <Input
                        ref={textInputRef}
                        placeholder={composerPlaceholder}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                void vm.onSubmit()
                            }
                        }}
                        className="w-full bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
                    />
                </TextField>

                <EmojiPickerPopover
                    placement="top end"
                    offset={8}
                    isOpen={emojiOpen}
                    onOpenChange={setEmojiOpen}
                    trigger={
                        <IconButton variant="ghost" isActive={emojiOpen} aria-label="Emoji">
                            <Smile className="h-[18px] w-[18px]" />
                        </IconButton>
                    }
                    onEmojiSelect={(emoji) => {
                        vm.onEmojiSelect(emoji)
                        setEmojiOpen(false)
                    }}
                />

                <Popover
                    placement="top end"
                    offset={8}
                    isOpen={gifOpen}
                    onOpenChange={setGifOpen}
                    trigger={
                        <IconButton
                            aria-label="GIF"
                            className={cn(
                                "shrink-0 rounded-full bg-surf3 px-[9px] py-[5px]",
                                "font-mono text-[9px] font-bold tracking-[0.06em] text-muted-foreground",
                                "hover:text-foreground aria-expanded:text-foreground",
                            )}
                        >
                            GIF
                        </IconButton>
                    }
                    className="overflow-visible"
                >
                    <GifPopover
                        onPickGif={(file) => {
                            vm.onAddFiles([file])
                            setGifOpen(false)
                        }}
                    />
                </Popover>

                <IconButton
                    onPress={() => void vm.onSubmit()}
                    aria-label="Send message"
                    isDisabled={!vm.canSend}
                    className={cn(
                        "h-[30px] w-[34px] shrink-0 rounded-full transition-opacity duration-150 disabled:opacity-100",
                        vm.canSend
                            ? "bg-action text-action-foreground shadow-[0_6px_20px_-6px_color-mix(in_oklab,var(--action)_70%,transparent)] hover:opacity-90"
                            : "bg-surf3 text-muted-foreground",
                    )}
                >
                    <Send className="h-[15px] w-[15px]" />
                </IconButton>
            </div>

            <div className="mx-3.5 mb-0.5 mt-[9px] flex gap-4 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
                <span>⏎ send</span>
                <span>⇧⏎ new line</span>
                <span>/ commands</span>
                <span className="ml-auto">Federated</span>
            </div>
        </div>
    )
})
