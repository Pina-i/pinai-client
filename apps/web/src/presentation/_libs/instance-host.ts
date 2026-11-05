import { instanceAddress } from "@pinai/domain/models/instance"

/** The instance the app signs in to, as people read it: its host, `idp.alice.com`. */
export function instanceHost(idpUrl: string | null): string {
    if (!idpUrl) return ""
    return instanceAddress(idpUrl)?.host ?? idpUrl
}
