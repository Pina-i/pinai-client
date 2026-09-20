import type { Pronouns, UserProfile } from "@pinai/domain/models/auth"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { AvatarCropDialog } from "@/presentation/molecules/AvatarCropDialog/AvatarCropDialog"
import { cn } from "@/presentation/_libs/utils"
import { PRONOUN_OPTIONS, useProfileEditorViewModel } from "./ProfileEditor.viewmodel"

interface ProfileEditorProps {
    user: UserProfile
}

const inputClass = cn(
    "h-9 w-full rounded-[var(--radius-sm)] border border-border bg-input px-3",
    "text-[13px] text-foreground outline-none transition-colors",
    "focus-visible:border-ring",
)

const fieldLabelClass = "mono-eyebrow mb-[5px] block text-muted-foreground"

export function ProfileEditor({ user }: ProfileEditorProps) {
    // See VerifyEmailPage: a ref inside the viewmodel object taints every
    // other property read on it for `react-hooks/refs`.
    const { fileInputRef, ...vm } = useProfileEditorViewModel(user)
    const initials = vm.draft.displayName.slice(0, 2).toUpperCase() || "?"

    return (
        <div className="flex flex-1 flex-col bg-card px-8 py-[30px]">
            <p className="mono-eyebrow mb-[5px] tracking-[0.14em] text-muted-foreground">Editing · Profile</p>
            <h2 className="title text-[24px] font-normal leading-tight tracking-[-0.01em] text-foreground">
                The face you put forward.
            </h2>

            {/* Avatar upload row */}
            <div className="mt-[22px] flex items-center gap-3.5">
                <Avatar initials={initials} imageUrl={vm.avatarUrl} color="var(--chat)" size="lg" />
                <div className="flex-1">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={vm.onFileChange}
                        className="hidden"
                    />
                    <div className="flex items-center gap-2">
                        <IconButton
                            isDisabled={vm.isAvatarBusy}
                            onPress={vm.onPickAvatarClick}
                            className="rounded-[5px] border border-border-strong px-3 py-[5px] text-[11.5px] text-foreground hover:bg-accent/40"
                        >
                            {vm.avatarUrl ? "Change avatar" : "Upload avatar"}
                        </IconButton>
                        {vm.avatarUrl && (
                            <IconButton
                                isDisabled={vm.isAvatarBusy}
                                onPress={vm.onRemoveAvatar}
                                className="rounded-[5px] px-3 py-[5px] text-[11.5px] text-muted-foreground hover:text-foreground"
                            >
                                Remove
                            </IconButton>
                        )}
                    </div>
                    <p className="mt-[5px] font-mono text-[10px] text-muted-foreground">JPG · PNG · WebP · GIF · max 20 MB</p>
                </div>
            </div>

            <AvatarCropDialog
                isOpen={vm.isCropOpen}
                file={vm.pickedFile}
                onClose={vm.onCropClose}
                onSave={vm.onCropSave}
            />

            {/* Fields */}
            <div className="mt-[18px] flex flex-col gap-3.5">
                <div>
                    <label className={fieldLabelClass}>Display name</label>
                    <input
                        className={inputClass}
                        value={vm.draft.displayName}
                        onChange={(e) => vm.setDisplayName(e.target.value)}
                    />
                </div>
                <div>
                    <label className={fieldLabelClass}>Pronouns</label>
                    <select
                        className={cn(inputClass, "appearance-none cursor-pointer")}
                        value={vm.draft.pronouns}
                        onChange={(e) => vm.setPronouns(e.target.value as "" | Pronouns)}
                    >
                        {PRONOUN_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={fieldLabelClass}>Bio</label>
                    <div
                        className={cn(
                            "min-h-[72px] rounded-[var(--radius-sm)] border border-border bg-input p-[10px_12px]",
                            "transition-colors focus-within:border-ring",
                        )}
                    >
                        <textarea
                            className={cn(
                                "w-full resize-none bg-transparent text-[13px] italic leading-[1.5] text-foreground outline-none",
                                "font-serif placeholder:not-italic placeholder:text-muted-foreground/70",
                            )}
                            rows={3}
                            placeholder="A few words about yourself…"
                            value={vm.draft.bio}
                            onChange={(e) => vm.setBio(e.target.value)}
                        />
                    </div>
                    <p className="mt-[5px] text-right font-mono text-[10px] text-muted-foreground">
                        {vm.bioCount} / {vm.bioMax}
                    </p>
                </div>
            </div>

            {/* Footer */}
            <div className="flex-1" />
            <div className="flex gap-2 border-t border-border pt-3.5">
                <IconButton
                    isDisabled={!vm.isDirty || vm.isSaving}
                    onPress={vm.reset}
                    className="rounded-[5px] px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground"
                >
                    Reset
                </IconButton>
                <span className="flex-1" />
                <IconButton
                    isDisabled={vm.isSaving}
                    onPress={vm.reset}
                    className="rounded-[5px] border border-border-strong px-3 py-2 text-[12px] text-foreground hover:bg-accent/40"
                >
                    Cancel
                </IconButton>
                <IconButton
                    isDisabled={!vm.isDirty || vm.isSaving}
                    onPress={vm.save}
                    className="rounded-[5px] bg-chat px-4 py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
                >
                    {vm.isSaving ? "Saving…" : "Save"}
                </IconButton>
            </div>
        </div>
    )
}
