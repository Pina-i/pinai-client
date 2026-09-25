import { editorFrame, editorTitle } from "../editor-styles"

interface PlaceholderEditorProps {
    sectionLabel: string
    sectionTitle: string
}

export function PlaceholderEditor({ sectionLabel, sectionTitle }: PlaceholderEditorProps) {
    return (
        <div className={editorFrame}>
            <p className="mono-eyebrow mb-[5px]">Editing · {sectionLabel}</p>
            <h2 className={editorTitle}>{sectionTitle}</h2>
            <div className="mt-8 flex flex-1 items-center justify-center rounded-[16px] border border-dashed border-line2 bg-[color-mix(in_oklab,var(--surf)_50%,transparent)] p-5 text-center">
                <p className="title text-[12px] italic text-muted-foreground">
                    Coming soon — this section is still on the drafting table.
                </p>
            </div>
        </div>
    )
}
