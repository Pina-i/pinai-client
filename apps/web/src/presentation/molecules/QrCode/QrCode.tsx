import { QRCodeSVG } from "qrcode.react"
import { cn } from "@/presentation/_libs/utils"

export interface QrCodeProps {
    /** The text the QR encodes — for TOTP this is an `otpauth://totp/...` URL. */
    value: string
    /** Pixel size of the rendered SVG. Defaults to 196. */
    size?: number
    className?: string
}

/**
 * Inline SVG QR rendered client-side. `level="M"` leaves room for the centre
 * overlay authenticator apps draw while scanning.
 */
export function QrCode({ value, size = 196, className }: QrCodeProps) {
    return (
        <div
            className={cn(
                // Always dark-on-white in both modes: inverted codes trip some scanners.
                "inline-flex items-center justify-center rounded-[14px] border border-line bg-white p-3 text-[oklch(0.145_0.014_196)]",
                className,
            )}
            role="img"
            aria-label="Authenticator QR code"
        >
            <QRCodeSVG
                value={value}
                size={size}
                level="M"
                marginSize={0}
                bgColor="transparent"
                fgColor="currentColor"
            />
        </div>
    )
}
