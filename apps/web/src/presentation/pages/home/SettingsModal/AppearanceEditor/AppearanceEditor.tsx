import type { ReactNode } from "react"
import { Check, Monitor, Moon, Sun } from "lucide-react"
import { MOTIFS, THEME_FAMILIES, themeId, type ModePreference } from "@pinai/domain/models/user-settings"
import { Motif } from "@/presentation/atoms/motif/motif"
import { ChoiceCard, ChoiceCardGroup } from "@/presentation/molecules/ChoiceCardGroup/ChoiceCardGroup"
import { SegmentedControl } from "@/presentation/molecules/SegmentedControl/SegmentedControl"
import { useAppearance } from "@/presentation/providers/AppearanceProvider/AppearanceProvider.context"
import { cn } from "@/presentation/_libs/utils"
import { editorFrame, editorTitle } from "../editor-styles"
import { FAMILY_LABELS, MOTIF_LABELS, THEME_SWATCHES } from "./appearance-catalog"
import { ThemePreview } from "./ThemePreview/ThemePreview"

const MODES = [
    { id: "system", label: "System", icon: <Monitor className="h-[13px] w-[13px]" /> },
    { id: "dark", label: "Dark", icon: <Moon className="h-[13px] w-[13px]" /> },
    { id: "light", label: "Light", icon: <Sun className="h-[13px] w-[13px]" /> },
] as const satisfies readonly { id: ModePreference; label: string; icon: ReactNode }[]

const sectionHead = "flex min-h-[30px] flex-wrap items-center justify-between gap-3"
const sectionLabel = "text-[12px] font-medium text-muted-foreground"

/**
 * Theme — a palette, shown in the mode this device paints — and the motif
 * woven behind panels and rules. Palette and motif are account settings; the
 * mode is this device's.
 */
export function AppearanceEditor() {
    const { appearance, modePreference, mode, setAppearance, setModePreference } = useAppearance()

    return (
        <div className={cn(editorFrame, "gap-[26px] pb-10 [&>*]:shrink-0")}>
            <div>
                <p className="mono-eyebrow mb-[5px]">— Appearance</p>
                <h2 className={editorTitle}>How the room looks.</h2>
            </div>

            <section className="flex flex-col gap-3">
                <div className={sectionHead}>
                    <span className={sectionLabel}>Theme</span>
                    <span className="flex items-center gap-3">
                        <span className="title text-[13px] italic text-muted-foreground">On this device</span>
                        <SegmentedControl
                            label="Mode"
                            items={MODES}
                            selected={modePreference}
                            onChange={setModePreference}
                        />
                    </span>
                </div>
                <p className="title -mt-1 text-[13px] italic text-muted-foreground">
                    Your palette and motif follow your account to every device; each device keeps its own mode.
                </p>
                <ChoiceCardGroup
                    label="Theme"
                    value={appearance.family}
                    onChange={(family) => setAppearance({ family })}
                    className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
                >
                    {THEME_FAMILIES.map((family) => {
                        const id = themeId(family, mode)
                        return (
                            <ChoiceCard
                                key={family}
                                value={family}
                                label={FAMILY_LABELS[family]}
                                className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surf px-1.5 pb-3 pt-1.5 hover:bg-surf2"
                                selectedClassName="border-acc shadow-[0_0_0_1px_var(--acc),0_10px_30px_-14px_var(--acc)]"
                            >
                                {({ isSelected }) => (
                                    <>
                                        <ThemePreview
                                            theme={id}
                                            motif={appearance.motif}
                                        />
                                        <span className="flex items-center gap-2 px-2">
                                            <span className="title flex-1 text-[18px]">{FAMILY_LABELS[family]}</span>
                                            {isSelected ? (
                                                <>
                                                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                                                        In use
                                                    </span>
                                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-acc text-background">
                                                        <Check className="h-3 w-3" />
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="flex">
                                                    {THEME_SWATCHES[id].map((color) => (
                                                        <i
                                                            key={color}
                                                            className="-ml-1 h-3 w-3 rounded-full border-2 border-background"
                                                            style={{ background: color }}
                                                        />
                                                    ))}
                                                </span>
                                            )}
                                        </span>
                                    </>
                                )}
                            </ChoiceCard>
                        )
                    })}
                </ChoiceCardGroup>
            </section>

            <section className="flex flex-col gap-3">
                <div className={sectionHead}>
                    <span className={sectionLabel}>Motif</span>
                    <span className="title text-[13px] italic text-muted-foreground">Woven faintly behind panels and rules.</span>
                </div>
                <ChoiceCardGroup
                    label="Motif"
                    value={appearance.motif}
                    onChange={(motif) => setAppearance({ motif })}
                    className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2.5"
                >
                    {MOTIFS.map((motif) => (
                        <ChoiceCard
                            key={motif}
                            value={motif}
                            className="flex flex-col gap-2 rounded-[18px] border border-line px-1.5 pb-2.5 pt-1.5 hover:bg-surf2"
                            selectedClassName="border-acc bg-acc-soft"
                        >
                            {() => (
                                <>
                                    <span className="relative block aspect-square overflow-hidden rounded-[13px] bg-surf2">
                                        <Motif
                                            variant="field"
                                            motif={motif}
                                            size={30}
                                            className="absolute inset-0"
                                            style={{ opacity: mode === "light" ? 0.38 : 0.3 }}
                                        />
                                    </span>
                                    <b className="title px-1 text-[15px] font-normal leading-[1.1]">{MOTIF_LABELS[motif].label}</b>
                                    <small className="title -mt-1.5 px-1 text-[12.5px] italic text-muted-foreground">
                                        {MOTIF_LABELS[motif].gloss}
                                    </small>
                                </>
                            )}
                        </ChoiceCard>
                    ))}
                </ChoiceCardGroup>
            </section>
        </div>
    )
}
