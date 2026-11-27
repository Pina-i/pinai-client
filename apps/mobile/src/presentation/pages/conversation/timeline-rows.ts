import { inTimeOrder, interleaveTimeline, startsRun } from "@pinai/domain/models/dm"
import { describeGroupEvent } from "@pinai/domain/models/group-event"
import { describeNewDevice, readNewDeviceLines } from "@pinai/domain/models/new-device"
import { dayDividerLabel } from "@pinai/domain/models/relative-time"
import type { CachedTimelineMessage, ConversationTimeline } from "@pinai/domain/ports/conversation-cache.port"

/** A line between the messages: a group's change, or someone's new device with what it means. */
export interface TimelineNotice {
    id: string
    createdAt: string
    text: string
    explanation?: string
}

export type TimelineRow<M> =
    | { kind: "day"; id: string; label: string }
    | { kind: "notice"; id: string; notice: TimelineNotice }
    | { kind: "message"; id: string; message: M; first: boolean }

/**
 * A conversation's rows, newest first for a list drawn from the bottom: the messages with the group's changes and the
 * new-device lines between them, a separator at each day, a run's first message showing its author.
 */
export function timelineRows<M extends CachedTimelineMessage>(timeline: ConversationTimeline<M>, me: string, now: Date): TimelineRow<M>[] {
    const notices = inTimeOrder<TimelineNotice>([
        ...timeline.groupEvents.map((event) => ({ id: event.id, createdAt: event.createdAt, text: describeGroupEvent(event, me) })),
        ...readNewDeviceLines(timeline.newDeviceLines).map((line) => ({ id: line.id, createdAt: line.createdAt, ...describeNewDevice(line) })),
    ])
    const rows: TimelineRow<M>[] = []
    let day: string | undefined
    let previous: M | null = null
    for (const item of interleaveTimeline(timeline.messages, notices)) {
        const date = new Date(item.entry.createdAt)
        if (date.toDateString() !== day) {
            day = date.toDateString()
            rows.push({ kind: "day", id: `day:${item.entry.id}`, label: dayDividerLabel(date, now) })
            previous = null
        }
        if (item.kind === "event") {
            rows.push({ kind: "notice", id: item.entry.id, notice: item.entry })
            previous = null
            continue
        }
        rows.push({ kind: "message", id: item.entry.id, message: item.entry, first: startsRun(previous, item.entry) })
        previous = item.entry
    }
    return rows.reverse()
}
