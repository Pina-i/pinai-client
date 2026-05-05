import { useRef, useState } from "react"
import AvatarEditor, { type AvatarEditorRef } from "react-avatar-editor"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

interface AvatarCropDialogProps {
    isOpen: boolean
    file: File | null
    onClose: () => void
    onSave: (blob: Blob) => Promise<void> | void
}

const OUTPUT_SIZE = 256
const JPEG_QUALITY = 0.9

export function AvatarCropDialog({ isOpen, file, onClose, onSave }: AvatarCropDialogProps) {
    const editorRef = useRef<AvatarEditorRef | null>(null)
    const [scale, setScale] = useState(1.2)
    const [rotate, setRotate] = useState(0)
    const [isSaving, setIsSaving] = useState(false)

    async function handleSave() {
        const editor = editorRef.current
        if (!editor) return

        setIsSaving(true)
        try {
            const canvas = editor.getImageScaledToCanvas()
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob((b: Blob | null) => resolve(b), "image/jpeg", JPEG_QUALITY),
            )
            if (!blob) throw new Error("Failed to encode cropped image")
            await onSave(blob)
            onClose()
            setScale(1.2)
            setRotate(0)
        } finally {
            setIsSaving(false)
        }
    }

    if (!file) return null

    return (
        <Modal isOpen={isOpen} onClose={onClose} isDismissable={!isSaving}>
            <div className="flex w-[360px] flex-col gap-4 rounded-[var(--radius-md)] border border-border bg-card p-5 shadow-2xl">
                <div>
                    <p className="mono-eyebrow tracking-[0.14em] text-muted-foreground">Editing · Avatar</p>
                    <h3 className="title text-[18px] font-normal leading-tight tracking-[-0.01em] text-foreground">
                        Frame your avatar.
                    </h3>
                </div>

                <div className="flex justify-center">
                    <AvatarEditor
                        ref={editorRef}
                        image={file}
                        width={OUTPUT_SIZE}
                        height={OUTPUT_SIZE}
                        border={20}
                        borderRadius={OUTPUT_SIZE}
                        color={[18, 18, 18, 0.6]}
                        scale={scale}
                        rotate={rotate}
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <div>
                        <label className="mono-eyebrow mb-1 block text-muted-foreground">Zoom</label>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.01}
                            value={scale}
                            onChange={(e) => setScale(Number(e.target.value))}
                            className="w-full accent-[color:var(--chat)]"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="mono-eyebrow text-muted-foreground">Rotate</span>
                        <IconButton
                            onPress={() => setRotate((r) => (r - 90 + 360) % 360)}
                            className="rounded-[5px] border border-border-strong px-2 py-[3px] text-[11.5px] text-foreground hover:bg-accent/40"
                        >
                            ⟲
                        </IconButton>
                        <IconButton
                            onPress={() => setRotate((r) => (r + 90) % 360)}
                            className="rounded-[5px] border border-border-strong px-2 py-[3px] text-[11.5px] text-foreground hover:bg-accent/40"
                        >
                            ⟳
                        </IconButton>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-border pt-3">
                    <IconButton
                        onPress={onClose}
                        isDisabled={isSaving}
                        className="rounded-[5px] border border-border-strong px-3 py-2 text-[12px] text-foreground hover:bg-accent/40"
                    >
                        Cancel
                    </IconButton>
                    <IconButton
                        onPress={handleSave}
                        isDisabled={isSaving}
                        className={cn(
                            "rounded-[5px] bg-chat px-4 py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-90",
                        )}
                    >
                        {isSaving ? "Saving…" : "Save"}
                    </IconButton>
                </div>
            </div>
        </Modal>
    )
}
