import { useState } from "react"
import { useNotificationSettings } from "@/presentation/providers/AppearanceProvider/NotificationSettings.context"
import {
    clockTime,
    durationLabel,
    isAnotherDay,
    MAX_MUTE_MINUTES,
    MUTE_STEP_MINUTES,
    minutesUntil,
    muteEndIn,
    muteUntilLabel,
    nextClockTime,
    stepMuteEnd,
} from "../../_helpers/mute-end.helper"

const DEFAULT_MUTE_MINUTES = 60

type ClockFields = [hours: string, minutes: string]

function fieldsOf(at: number): ClockFields {
    const [hours, minutes] = clockTime(at).split(":")
    return [hours, minutes]
}

export function useMuteAllControlViewModel() {
    const { notifications, setMuteAll } = useNotificationSettings()
    // The popover mounts this on open; every handler that moves the end takes a fresh reading.
    const [now, setNow] = useState(() => Date.now())
    const [isEditing, setIsEditing] = useState(false)
    const [end, setEnd] = useState(() => muteEndIn(DEFAULT_MUTE_MINUTES, now))
    const [fields, setFields] = useState<ClockFields>(() => fieldsOf(end))

    const isMuted = notifications.muteAll
    const until = notifications.muteAllUntil
    const isInvalid = nextClockTime(fields[0], fields[1], now) === null
    const minutesLeft = minutesUntil(end, now)

    function moveEnd(next: number, at: number) {
        setNow(at)
        setEnd(next)
        setFields(fieldsOf(next))
    }

    function startEditing() {
        const at = Date.now()
        const minutes = until === null ? DEFAULT_MUTE_MINUTES : Math.max(1, minutesUntil(until, at))
        moveEnd(muteEndIn(minutes, at), at)
        setIsEditing(true)
    }

    function step(delta: number) {
        const at = Date.now()
        moveEnd(stepMuteEnd(end, delta, at), at)
    }

    function typeField(index: 0 | 1, raw: string) {
        const digits = raw.replace(/\D/g, "").slice(0, 2)
        const next: ClockFields = index === 0 ? [digits, fields[1]] : [fields[0], digits]
        setFields(next)
        const at = Date.now()
        const typedEnd = nextClockTime(next[0], next[1], at)
        if (typedEnd === null) return
        setNow(at)
        setEnd(typedEnd)
    }

    function settleFields() {
        if (!isInvalid) setFields(fieldsOf(end))
    }

    function muteUntilUnmuted() {
        setMuteAll(true, null)
        setIsEditing(false)
    }

    function unmute() {
        setMuteAll(false)
        setIsEditing(false)
    }

    function confirmEnd() {
        // Taken from the fields, not `end`: an editor left open past the time it shows mutes until its next occurrence.
        const confirmed = nextClockTime(fields[0], fields[1], Date.now())
        if (confirmed === null) return
        setMuteAll(true, confirmed)
        setIsEditing(false)
    }

    return {
        isMuted,
        hasEnd: until !== null,
        untilLabel: muteUntilLabel(until, now),
        isEditing,
        fields,
        isInvalid,
        canStepDown: minutesLeft > MUTE_STEP_MINUTES,
        canStepUp: minutesLeft < MAX_MUTE_MINUTES,
        hint: isInvalid
            ? "Enter a time, 00:00–23:59"
            : `${isAnotherDay(end, now) ? "tomorrow · " : ""}in ${durationLabel(minutesLeft)}`,
        confirmLabel: `Unmute at ${isInvalid ? "—" : clockTime(end)}`,
        muteUntilUnmuted,
        unmute,
        startEditing,
        cancelEditing: () => setIsEditing(false),
        stepDown: () => step(-MUTE_STEP_MINUTES),
        stepUp: () => step(MUTE_STEP_MINUTES),
        typeField,
        settleFields,
        confirmEnd,
    }
}
