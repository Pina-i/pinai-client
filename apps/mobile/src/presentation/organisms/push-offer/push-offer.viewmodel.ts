import { doorState } from "@pinai/domain/models/approval-door"
import { useEffect, useState } from "react"
import { pushOffer } from "@/ioc"
import { useAnswering, useDoorSummons, useDoorView } from "@/presentation/_libs/approval-answering"
import { askPushPermission, pushAvailable, readPushPermission } from "@/presentation/_libs/push-notices"
import { useStartOverPrompt } from "@/presentation/_libs/start-over-prompt"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"

/** Offered once, the first time the phone is in and Android hasn't been asked; after the Door and the prompt. */
export function usePushOfferViewModel() {
    const answering = useAnswering()
    const view = useDoorView(answering)
    const summons = useDoorSummons(answering)
    const prompt = useStartOverPrompt()
    const [due, setDue] = useState(false)

    useEffect(() => {
        if (!pushAvailable || pushOffer.made()) return
        let live = true
        readPushPermission()
            .then((permission) => {
                if (!live) return
                // Allowed already, or refused for good: nothing to offer, ever.
                if (permission === "undetermined") setDue(true)
                else pushOffer.markMade()
            })
            .catch((error: unknown) => warnE2ee("reading the notification permission", error))
        return () => {
            live = false
        }
    }, [])

    const close = () => {
        pushOffer.markMade()
        setDue(false)
    }

    return {
        visible: due && !doorState(view, summons).isOpen && prompt === null,
        onTurnOn: () => {
            close()
            askPushPermission().catch((error: unknown) => warnE2ee("asking for the notification permission", error))
        },
        onNotNow: close,
    }
}
