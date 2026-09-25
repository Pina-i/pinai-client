import { useRef, useState } from "react"
import AvatarEditor, { type AvatarEditorRef } from "react-avatar-editor"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { Button } from "@/presentation/atoms/Button/Button"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

const rotateClass =
    "h-7 w-7 rounded-full border border-line2 text-[12px] text-foreground hover:bg-surf2"

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
        <Modal isOpen={isOpen} onClose={onClose} isDismissable={!isSaving} label="Crop avatar">
            <div className={cn(modalSurface, "w-[360px] gap-4 p-5")}>
                <div>
                    <p className="mono-eyebrow mb-[5px]">Editing · Avatar</p>
                    <h3 className="title text-[20px] font-normal leading-tight tracking-[-0.01em] text-foreground">
                        Frame your avatar.
                    </h3>
                </div>

                <div className="flex justify-center overflow-hidden rounded-[14px] border border-line bg-background">
                    <AvatarEditor
                        ref={editorRef}
                        image={file}
                        width={OUTPUT_SIZE}
                        height={OUTPUT_SIZE}
                        border={20}
                        borderRadius={OUTPUT_SIZE}
                        color={[14, 17, 22, 0.6]}
                        scale={scale}
                        rotate={rotate}
                    />
                </div>

                <div className="flex flex-col gap-3">
                    <div>
                        <label className="mb-[5px] block font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                            Zoom
                        </label>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.01}
                            value={scale}
                            onChange={(e) => setScale(Number(e.target.value))}
                            className="w-full cursor-pointer accent-[color:var(--acc)]"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                            Rotate
                        </span>
                        <IconButton
                            aria-label="Rotate left"
                            onPress={() => setRotate((r) => (r - 90 + 360) % 360)}
                            className={rotateClass}
                        >
                            ⟲
                        </IconButton>
                        <IconButton
                            aria-label="Rotate right"
                            onPress={() => setRotate((r) => (r + 90) % 360)}
                            className={rotateClass}
                        >
                            ⟳
                        </IconButton>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-line pt-3.5">
                    <Button variant="secondary" size="inline" onPress={onClose} isDisabled={isSaving}>
                        Cancel
                    </Button>
                    <Button variant="primary" size="inline" onPress={handleSave} isDisabled={isSaving}>
                        {isSaving ? "Saving…" : "Save"}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
