import { ArrowRight, Check, Globe } from "lucide-react"
import type { InstanceAddress } from "@pinai/domain/models/instance"
import { Button, ButtonLink } from "@/presentation/atoms/Button/Button"
import { Chip } from "@/presentation/atoms/chip/chip"
import { TextField } from "@/presentation/atoms/TextField/TextField"
import { cn } from "@/presentation/_libs/utils"

export type ResolutionTone = "plain" | "ok" | "error"

interface HomePickerProps {
    address: string
    onAddressChange: (value: string) => void
    /** The line under the field, and how it reads. */
    resolution: { line: string; tone: ResolutionTone }
    /** The host the field resolved to, once it did. */
    resolvedHost: string | null
    recent: InstanceAddress[]
    onPickRecent: (address: InstanceAddress) => void
    onContinue: () => void
}

const SELF_HOST_URL = "https://github.com/Pina-i/pinai#readme"

export function HomePicker({
    address,
    onAddressChange,
    resolution,
    resolvedHost,
    recent,
    onPickRecent,
    onContinue,
}: HomePickerProps) {
    return (
        <div className="rounded-[22px] border border-line bg-surf px-7 pb-7 pt-[26px] backdrop-blur-[14px]">
            <p className="eye">— Welcome</p>
            <h2 className="title mt-2 text-[32px] font-normal tracking-[-0.015em] text-foreground">Pick your home</h2>
            <p className="mb-5 mt-3 text-[13.5px] leading-[1.55] text-muted-foreground">
                Pīna'i is federated. Tell us where your identity lives and we'll take you there.
            </p>

            <TextField
                label="Identity provider"
                mono
                valid={resolvedHost !== null}
                icon={<Globe size={15} strokeWidth={1.9} />}
                trailing={resolvedHost !== null ? <Check size={14} strokeWidth={1.9} /> : undefined}
                value={address}
                onChange={onAddressChange}
                placeholder="aotearoa.nz"
                autoFocus
                aria-describedby="home-resolution"
                onKeyDown={(e) => {
                    if (e.key === "Enter") onContinue()
                }}
            />
            <p
                id="home-resolution"
                aria-live="polite"
                className={cn(
                    "mt-2 flex min-h-4 items-center gap-1.5 font-mono text-[10px] tracking-[0.03em] text-muted-foreground [font-variant-ligatures:none]",
                    resolution.tone === "ok" && "text-on",
                    resolution.tone === "error" && "text-dnd",
                )}
            >
                {resolution.line}
            </p>

            {recent.length > 0 && (
                <>
                    <p className="eye mb-2 mt-3.5">Recent</p>
                    <div className="flex flex-wrap gap-1.5">
                        {recent.map((known) => (
                            <Chip
                                key={known.origin}
                                isSelected={known.host === resolvedHost}
                                onPress={() => onPickRecent(known)}
                            >
                                {known.host}
                            </Chip>
                        ))}
                    </div>
                </>
            )}

            <div className="mt-5">
                <Button
                    variant="primary"
                    onPress={onContinue}
                    isDisabled={resolvedHost === null}
                    className="disabled:cursor-default disabled:opacity-45"
                >
                    {resolvedHost !== null ? `Continue to ${resolvedHost}` : "Continue"}
                    <ArrowRight size={15} strokeWidth={1.9} />
                </Button>
            </div>

            <div className="my-[18px] flex items-center gap-3 text-muted-foreground">
                <span className="h-px flex-1 bg-line2" />
                <span className="eye lowercase">or</span>
                <span className="h-px flex-1 bg-line2" />
            </div>

            <ButtonLink variant="secondary" href={SELF_HOST_URL} target="_blank" rel="noreferrer">
                <span className="h-1.5 w-1.5 rounded-full bg-sec" />
                Self-host a new instance
            </ButtonLink>
        </div>
    )
}
