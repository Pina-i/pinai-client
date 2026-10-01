import { addressParts } from "@pinai/domain/models/identity"

const MRZ_WIDTH = 44

// A machine-readable zone only holds A–Z, 0–9 and the `<` filler.
function mrzText(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "<")
}

function mrzLine(text: string): string {
    return (text + "<".repeat(MRZ_WIDTH)).slice(0, MRZ_WIDTH)
}

/** The passport's two decorative MRZ lines: name and home server, then handle. */
export function passportMrz(displayName: string, address: string): [string, string] {
    const { handle, host } = addressParts(address)
    return [mrzLine(`P<PNA${mrzText(displayName)}<<${mrzText(host)}`), mrzLine(`${mrzText(handle)}<`)]
}
