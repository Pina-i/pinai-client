import { findsNobody, searchMode, type PeopleFound } from "../../models/people-search"
import type { ISocialPort } from "../../ports/social.port"

export async function searchPeopleUseCase(
    idpUrl: string,
    accessToken: string,
    text: string,
    socialPort: ISocialPort,
): Promise<PeopleFound> {
    const mode = searchMode(text)
    if (mode.kind !== "names") throw new Error("Not a search by name")
    if (findsNobody(mode.query)) return { server: [], groups: [] }

    return socialPort.searchPeople(idpUrl, accessToken, mode.query)
}
