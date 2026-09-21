interface PlaceholderEditorProps {
    sectionLabel: string
    sectionTitle: string
}

export function PlaceholderEditor({ sectionLabel, sectionTitle }: PlaceholderEditorProps) {
    return (
        <div className="flex flex-1 flex-col bg-card px-8 py-[30px]">
            <p className="mono-eyebrow mb-[5px] tracking-[0.14em] text-muted-foreground">
                Editing · {sectionLabel}
            </p>
            <h2 className="title text-[24px] font-normal leading-tight tracking-[-0.01em] text-foreground">
                {sectionTitle}
            </h2>
            <div className="mt-8 flex flex-1 items-center justify-center rounded-[var(--radius)] border border-dashed border-border bg-[color-mix(in_oklab,var(--card)_50%,transparent)]">
                <p className="text-[12px] italic text-muted-foreground font-serif">
                    Coming soon — this section is still on the drafting table.
                </p>
            </div>
        </div>
    )
}
