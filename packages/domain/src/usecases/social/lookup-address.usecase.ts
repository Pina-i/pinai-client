import { searchMode, type AddressLookup } from "../../models/people-search"
import type { ISocialPort } from "../../ports/social.port"

export async function lookupAddressUseCase(
    idpUrl: string,
    accessToken: string,
    text: string,
    socialPort: ISocialPort,
): Promise<AddressLookup> {
    const mode = searchMode(text)
    if (mode.kind !== "address") throw new Error("Not a complete address")

    return socialPort.lookupAddress(idpUrl, accessToken, mode.address)
}
