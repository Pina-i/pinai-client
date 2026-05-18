import { Plus, Reply, Send, Smile, X } from "lucide-react"
import { useEffect, useRef, useState, type RefObject } from "react"
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

const FOOTER_HINTS_CLASS =
    "mt-1.5 flex gap-3.5 px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"

export function MessageInput({
    placeholder,
    onSend,
    onType,
    replyTo,
    onCancelReply,
    handleRef,
}: MessageInputProps) {
    const vm = useMessageInputViewModel({ onSend, onType, handleRef })

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

    return (
        <div className="shrink-0 px-6 pb-5">
            {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-chat bg-accent/40 px-3 py-2 text-xs text-muted-foreground">
                    <Reply className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground">{replyTo.author}</span>
                    <span className="flex-1 truncate">{replyTo.content}</span>
                    <IconButton
                        aria-label="Cancel reply"
                        onPress={onCancelReply}
                        className="shrink-0 hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </IconButton>
                </div>
            )}

            <div className="rounded-[var(--radius-lg)] border border-border-strong bg-card p-2.5">
                {/* Hidden file input — triggered by the plus icon. */}
                <input
                    ref={vm.pickedFileInputRef}
                    type="file"
                    multiple
                    onChange={vm.onFileInputChange}
                    className="hidden"
                />

                {stripMode === "uploading" && (
                    <div className="mb-2 flex flex-col gap-1.5 border-b border-border pb-2.5">
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
                    <div className="mb-2 flex flex-wrap gap-1.5 border-b border-border pb-2.5">
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
                                    "cursor-pointer rounded-full border border-dashed border-border-strong",
                                    "bg-transparent px-3 py-1 font-mono text-[11px] tracking-[0.04em] text-muted-foreground hover:text-foreground",
                                )}
                            >
                                + add file
                            </button>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <IconButton
                        onPress={vm.onPickClick}
                        aria-label="Attach files"
                        isDisabled={vm.pending.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <Plus className="h-5 w-5" />
                    </IconButton>

                    <TextField
                        value={vm.value}
                        onChange={vm.setValue}
                        aria-label="Message"
                        className="flex-1"
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
                            className="w-full bg-transparent py-1 text-[13.5px] text-foreground placeholder:text-muted-foreground outline-none"
                        />
                    </TextField>

                    <EmojiPickerPopover
                        placement="top end"
                        offset={8}
                        isOpen={emojiOpen}
                        onOpenChange={setEmojiOpen}
                        trigger={
                            <IconButton aria-label="Emoji" className="text-muted-foreground hover:text-foreground">
                                <Smile className="h-5 w-5" />
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
                                    "h-[30px] w-[30px] cursor-pointer rounded-[var(--radius-sm)] border border-border bg-transparent",
                                    "font-mono text-[9.5px] font-semibold tracking-[0.06em] text-muted-foreground",
                                    "hover:text-foreground",
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
                            "h-7 w-8 rounded-[var(--radius-sm)] transition-opacity",
                            vm.canSend
                                ? "bg-chat text-primary-foreground hover:opacity-90"
                                : "bg-accent text-muted-foreground opacity-60",
                        )}
                    >
                        <Send className="h-4 w-4" />
                    </IconButton>
                </div>
            </div>

            <div className={FOOTER_HINTS_CLASS}>
                <span>⏎ send</span>
                <span>⇧⏎ new line</span>
                <span>/ commands</span>
                <span className="ml-auto">Federated</span>
            </div>
        </div>
    )
}
