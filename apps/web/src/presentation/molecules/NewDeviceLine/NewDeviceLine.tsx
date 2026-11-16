import { Button } from "@/presentation/atoms/Button/Button"
import { Popover } from "@/presentation/molecules/Popover/Popover"
import { popoverSurface } from "@/presentation/molecules/Popover/popover-surface"
import { cn } from "@/presentation/_libs/utils"

interface NewDeviceLineProps {
    text: string
    /** What pressing the line shows. */
    explanation: string
    /** Pre-formatted "HH:MM". */
    timestamp: string
}

/** Someone's device that joined by itself, unproven: a line among the group's changes, explained when pressed. */
export function NewDeviceLine({ text, explanation, timestamp }: NewDeviceLineProps) {
    return (
        <div className="my-1.5 flex items-baseline justify-center gap-2 px-4 text-center">
            <Popover
                label="About this new device"
                placement="top"
                offset={10}
                className={cn(popoverSurface, "max-w-[min(340px,calc(100vw-32px))] px-4 py-3")}
                trigger={
                    <Button
                        variant="ghost"
                        size="none"
                        className="whitespace-normal text-[12.5px] decoration-dotted decoration-muted-foreground/60 underline-offset-[3px]"
                    >
                        {text}
                    </Button>
                }
            >
                <p className="text-left text-[13px] leading-relaxed text-muted-foreground">{explanation}</p>
            </Popover>
            <span className="font-mono text-[9.5px] tracking-[0.03em] text-muted-foreground/70">{timestamp}</span>
        </div>
    )
}
