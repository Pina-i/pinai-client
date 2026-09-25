import type { Pronouns, UserProfile } from "@pinai/domain/models/auth"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { AvatarCropDialog } from "@/presentation/molecules/AvatarCropDialog/AvatarCropDialog"
import { cn } from "@/presentation/_libs/utils"
import { editorFrame, editorTitle, fieldLabel, pill } from "../editor-styles"
import { PRONOUN_OPTIONS, useProfileEditorViewModel } from "./ProfileEditor.viewmodel"

interface ProfileEditorProps {
    user: UserProfile
}

const inputClass = cn(
    "h-9 w-full rounded-[12px] border border-line bg-surf2 px-3",
    "font-sans text-[13px] text-foreground outline-none transition-colors duration-150",
    "focus-visible:border-acc",
)

export function ProfileEditor({ user }: ProfileEditorProps) {
    // See VerifyEmailPage: a ref inside the viewmodel object taints every
    // other property read on it for `react-hooks/refs`.
    const { fileInputRef, ...vm } = useProfileEditorViewModel(user)
    const initials = vm.draft.displayName.slice(0, 2).toUpperCase() || "?"

    return (
        <div className={editorFrame}>
            <p className="mono-eyebrow mb-[5px]">Editing · Profile</p>
            <h2 className={editorTitle}>The face you put forward.</h2>

            <div className="mt-[22px] flex flex-wrap items-center gap-3.5">
                <Avatar initials={initials} imageUrl={vm.avatarUrl} tone="acc" size="lg" />
                <div className="flex-[1_1_180px]">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={vm.onFileChange}
                        className="hidden"
                    />
                    <div className="flex gap-2">
                        <IconButton
                            isDisabled={vm.isAvatarBusy}
                            onPress={vm.onPickAvatarClick}
                            className={pill({ variant: "outline" })}
                        >
                            {vm.avatarUrl ? "Change avatar" : "Upload avatar"}
                        </IconButton>
                        {vm.avatarUrl && (
                            <IconButton
                                isDisabled={vm.isAvatarBusy}
                                onPress={vm.onRemoveAvatar}
                                className={pill({ variant: "bare" })}
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

            <div className="mt-[18px] flex flex-col gap-3.5">
                <div>
                    <label className={fieldLabel}>Display name</label>
                    <input
                        className={inputClass}
                        value={vm.draft.displayName}
                        onChange={(e) => vm.setDisplayName(e.target.value)}
                    />
                </div>
                <div>
                    <label className={fieldLabel}>Pronouns</label>
                    <select
                        className={cn(inputClass, "cursor-pointer appearance-none")}
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
                    <label className={fieldLabel}>Bio</label>
                    <div
                        className={cn(
                            "min-h-[72px] rounded-[12px] border border-line bg-surf2 px-3 py-2.5",
                            "transition-colors duration-150 focus-within:border-acc",
                        )}
                    >
                        <textarea
                            className={cn(
                                "title w-full resize-none bg-transparent text-[13px] italic leading-[1.5] text-foreground outline-none",
                                "placeholder:not-italic placeholder:text-muted-foreground",
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

            <div className="mt-[22px] flex items-center gap-2 border-t border-line pt-3.5">
                <IconButton
                    isDisabled={!vm.isDirty || vm.isSaving}
                    onPress={vm.reset}
                    className={pill({ variant: "bare" })}
                >
                    Reset
                </IconButton>
                <span className="flex-1" />
                <IconButton isDisabled={vm.isSaving} onPress={vm.reset} className={pill({ variant: "cancel" })}>
                    Cancel
                </IconButton>
                <IconButton
                    isDisabled={!vm.isDirty || vm.isSaving}
                    onPress={vm.save}
                    className={pill({ variant: "save" })}
                >
                    {vm.isSaving ? "Saving…" : "Save"}
                </IconButton>
            </div>
        </div>
    )
}
