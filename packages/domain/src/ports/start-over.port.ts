import type { StartOverRequest } from "../models/start-over"

/** What `POST /api/history/start-over` answers: the request, as it matures as of the answer. */
export interface AskedStartOver {
    id: string
    createdAt: number
    readyAt: number
}

/** `/api/history/start-over` (`identity-provider/specs/e2ee.md § 3.12`). Refusals are `IdpError`s. */
export interface IStartOverPort {
    /** The session's device asks to start over; its own open request again when it asked already. */
    ask(idpUrl: string, accessToken: string): Promise<AskedStartOver>
    /** The account's open request, or the asker's latest, ended; `null` when there is none (`404`). */
    read(idpUrl: string, accessToken: string): Promise<StartOverRequest | null>
    /** An approved device cancels it; the asker withdraws it. */
    end(idpUrl: string, accessToken: string, requestId: string): Promise<void>
}
