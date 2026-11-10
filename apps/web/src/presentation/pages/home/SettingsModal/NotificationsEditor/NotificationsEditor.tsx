import { Switch } from "@/presentation/atoms/Switch/Switch"
import { editorFrame, editorTitle, fieldLabel } from "../editor-styles"
import { PlaceholderEditor } from "../PlaceholderEditor/PlaceholderEditor"
import { useNotificationsEditorViewModel } from "./NotificationsEditor.viewmodel"

const row = "mt-1 flex items-start justify-between gap-4 rounded-[16px] border border-line bg-surf px-4 py-3"

interface NotificationsEditorProps {
    sectionLabel: string
    sectionTitle: string
}

export function NotificationsEditor({ sectionLabel, sectionTitle }: NotificationsEditorProps) {
    const { keepRunning, setKeepRunning } = useNotificationsEditorViewModel()

    if (keepRunning.kind === "absent") return <PlaceholderEditor sectionLabel={sectionLabel} sectionTitle={sectionTitle} />

    return (
        <div className={editorFrame}>
            <p className="mono-eyebrow mb-[5px] pr-11">Editing · {sectionLabel}</p>
            <h2 className={editorTitle}>{sectionTitle}</h2>

            <section className="mt-7">
                <span className={fieldLabel}>On this device</span>
                {keepRunning.kind === "pending" ? (
                    <div className={row} aria-busy="true">
                        <span className="min-w-0 text-[13.5px] font-semibold">{keepRunning.label}</span>
                        <span className="h-[22px] w-[38px] shrink-0 rounded-full bg-surf3 opacity-50" />
                    </div>
                ) : (
                    <Switch isSelected={keepRunning.isSelected} onChange={setKeepRunning} className={row}>
                        <span className="order-first min-w-0">
                            <span className="block text-[13.5px] font-semibold">{keepRunning.label}</span>
                            <span className="mt-0.5 block text-[12px] text-muted-foreground">{keepRunning.description}</span>
                        </span>
                    </Switch>
                )}
            </section>
        </div>
    )
}
