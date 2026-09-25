import { useCallback, useEffect, useState } from "react"
import { Button as AriaButton } from "react-aria-components"
import { cn } from "@/presentation/_libs/utils"

export interface PronounceBadgeProps {
    className?: string
    /** Compact variant — smaller text, tighter padding. */
    size?: "sm" | "md"
}

/**
 * Pronunciation pill: the IPA transcription in italic serif. Pressing it has
 * the browser's SpeechSynthesis say the name; it tints to the accent while
 * speaking. Without `speechSynthesis` it is a static label.
 */
export function PronounceBadge({ className, size = "md" }: PronounceBadgeProps) {
    const [playing, setPlaying] = useState(false)
    const sm = size === "sm"

    useEffect(() => {
        return () => {
            if (typeof window !== "undefined" && window.speechSynthesis) {
                window.speechSynthesis.cancel()
            }
        }
    }, [])

    const speak = useCallback(() => {
        if (typeof window === "undefined" || !window.speechSynthesis) return
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance("pee-nah ee")
        utterance.lang = "en-US"
        utterance.rate = 0.78
        utterance.pitch = 1.02
        utterance.onend = () => setPlaying(false)
        utterance.onerror = () => setPlaying(false)
        setPlaying(true)
        window.speechSynthesis.speak(utterance)
    }, [])

    return (
        <AriaButton
            onPress={speak}
            aria-label="Hear how Pīna'i is pronounced"
            className={cn(
                "inline-flex items-center rounded-full border border-acc-line bg-acc-soft leading-none",
                "cursor-pointer outline-none transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                "title italic tracking-[0.01em]",
                playing ? "text-acc" : "text-muted-foreground hover:text-foreground",
                sm ? "px-[7px] py-[2px] text-[10.5px]" : "px-2.5 py-1 text-[12.5px]",
                className,
            )}
        >
            /piː.na.ʔi/
        </AriaButton>
    )
}
