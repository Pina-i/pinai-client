import { useId } from "react"

import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

import { fieldCount, fieldHint, fieldLabel, pill, textArea, textAreaInput, textInput } from "../../editor-styles"
import type { IntroFormViewModel } from "./IntroForm.viewmodel"

interface IntroFormProps {
    intro: IntroFormViewModel
}

export function IntroForm({ intro }: IntroFormProps) {
    const id = useId()
    const nameOver = intro.isOver("name")
    const descriptionOver = intro.isOver("description")
    const { preview } = intro

    return (
        <div className="mt-[26px] grid grid-cols-1 items-start gap-[22px] @min-[520px]:grid-cols-[minmax(0,1fr)_minmax(220px,300px)]">
            <div className="flex flex-col gap-4">
                <div>
                    <label htmlFor={`${id}-name`} className={fieldLabel}>
                        Name
                    </label>
                    <input
                        id={`${id}-name`}
                        className={cn(textInput, nameOver && "border-dnd focus-visible:border-dnd")}
                        placeholder={preview.host}
                        value={intro.name}
                        aria-invalid={nameOver || undefined}
                        aria-describedby={nameOver ? `${id}-name-count` : undefined}
                        onChange={(e) => intro.setName(e.target.value)}
                    />
                    {nameOver && (
                        <p id={`${id}-name-count`} className={cn(fieldCount, "text-dnd")}>
                            {intro.length.name} / {intro.limits.name}
                        </p>
                    )}
                </div>
                <div>
                    <label htmlFor={`${id}-description`} className={fieldLabel}>
                        Description
                    </label>
                    <div className={cn(textArea, descriptionOver && "border-dnd focus-within:border-dnd")}>
                        <textarea
                            id={`${id}-description`}
                            className={textAreaInput}
                            rows={3}
                            placeholder="One sentence about who gathers here…"
                            value={intro.description}
                            aria-invalid={descriptionOver || undefined}
                            aria-describedby={`${id}-description-count ${id}-description-hint`}
                            onChange={(e) => intro.setDescription(e.target.value)}
                        />
                    </div>
                    <p id={`${id}-description-count`} className={cn(fieldCount, descriptionOver && "text-dnd")}>
                        {intro.length.description} / {intro.limits.description}
                    </p>
                    <p id={`${id}-description-hint`} className={fieldHint}>
                        Shown on the sign-in pages and in invitations. One sentence; it is set as a headline.
                    </p>
                </div>
                <p className={cn(fieldHint, "mt-0")}>
                    Saving here takes over from INSTANCE_NAME and INSTANCE_DESCRIPTION in .env.
                </p>
                <p className="sr-only" aria-live="polite">
                    {intro.limitNotice}
                </p>
                <div className="mt-1 flex items-center gap-2 border-t border-line pt-3.5">
                    <span className="flex-1" />
                    <IconButton isDisabled={!intro.canCancel} onPress={intro.cancel} className={pill({ variant: "cancel" })}>
                        Cancel
                    </IconButton>
                    <IconButton
                        isDisabled={!intro.canSave}
                        isPending={intro.isSaving}
                        onPress={() => void intro.save()}
                        className={pill({ variant: "save" })}
                    >
                        {intro.isSaving ? "Saving…" : "Save"}
                    </IconButton>
                </div>
            </div>

            <section
                aria-label="How the sign-in page will read"
                className="rounded-[16px] border border-line bg-surf px-[18px] pb-4 pt-[18px]"
            >
                <p className="fact fact-plain">{preview.host}</p>
                <p
                    className={cn(
                        "title mt-3 text-pretty text-[24px] font-normal leading-[1.08] tracking-[-0.012em] wrap-anywhere",
                        preview.defaultHeadline ? "text-muted-foreground" : "text-foreground",
                    )}
                >
                    {preview.headline}
                </p>
                <div className="mt-3.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
                    {preview.people && <span className="fact fact-plain">{preview.people}</span>}
                    <span className={cn("fact fact-plain", preview.open ? "text-on" : "text-idle")}>
                        {preview.open ? "open registration" : "invite only"}
                    </span>
                </div>
                <p className="mt-[18px] border-t border-line pt-3 text-[12.5px] text-muted-foreground wrap-anywhere">
                    {preview.signIn}
                </p>
            </section>
        </div>
    )
}
