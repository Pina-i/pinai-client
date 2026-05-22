import { useCallback, useEffect, useState } from "react"
import { Button as AriaButton } from "react-aria-components"
import { cn } from "@/presentation/_libs/utils"

export interface PronounceBadgeProps {
    className?: string
    /** Compact variant — smaller icon + IPA text, tighter padding. */
    size?: "sm" | "md"
}

/**
 * Editorial pronunciation pill. Shows the IPA transcription `/piː.na.ʔi/` in
 * italic serif next to a speaker icon; click triggers the browser's
 * SpeechSynthesis to say the app name out loud. Animated speaker waves while
 * playing.
 *
 * Browsers without `window.speechSynthesis` (rare) render the badge as a
 * disabled-looking static label — no error, just no audio.
 */
export function PronounceBadge({ className, size = "md" }: PronounceBadgeProps) {
    const [playing, setPlaying] = useState(false)
    const sm = size === "sm"
    const iconPx = sm ? 9 : 11

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
                "group inline-flex items-center rounded-full leading-none",
                "border border-[color:color-mix(in_oklab,var(--chat)_24%,var(--border))]",
                "bg-[color:color-mix(in_oklab,var(--chat)_6%,transparent)]",
                "cursor-pointer outline-none transition-colors duration-150",
                "hover:bg-[color:color-mix(in_oklab,var(--chat)_14%,transparent)]",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                playing ? "text-chat" : "text-muted-foreground hover:text-chat",
                sm ? "gap-[5px] py-[2px] pl-[6px] pr-[7px]" : "gap-[7px] py-[4px] pl-[8px] pr-[9px]",
                className,
            )}
        >
            <span
                aria-hidden
                className="relative inline-flex items-center justify-center"
                style={{ width: iconPx, height: iconPx }}
            >
                <svg
                    width={iconPx}
                    height={iconPx}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path
                        d="M11 5L6 9H2v6h4l5 4V5z"
                        fill="currentColor"
                        stroke="none"
                        opacity="0.85"
                    />
                    {!playing && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
                    {playing && (
                        <>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07">
                                <animate
                                    attributeName="opacity"
                                    values="0.3;1;0.3"
                                    dur="1.1s"
                                    repeatCount="indefinite"
                                />
                            </path>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14">
                                <animate
                                    attributeName="opacity"
                                    values="0.15;0.9;0.15"
                                    dur="1.1s"
                                    begin="0.18s"
                                    repeatCount="indefinite"
                                />
                            </path>
                        </>
                    )}
                </svg>
            </span>
            <span
                className={cn(
                    "italic font-normal text-inherit",
                    "font-[family-name:var(--font-serif),serif]",
                    sm ? "text-[10.5px]" : "text-[13px]",
                )}
                style={{ letterSpacing: "0.01em" }}
            >
                /piː.na.ʔi/
            </span>
        </AriaButton>
    )
}
